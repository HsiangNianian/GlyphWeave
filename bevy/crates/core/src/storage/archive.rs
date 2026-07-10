//! Safe, deterministic ZIP container handling for `.gemap` v3.

use std::collections::{BTreeMap, HashSet};
use std::io::{Cursor, Read, Seek, SeekFrom, Write};

use thiserror::Error;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ArchiveLimits {
    pub max_archive_size: u64,
    pub max_entries: usize,
    pub max_entry_size: u64,
    pub max_total_size: u64,
    pub max_compression_ratio: u64,
}

impl Default for ArchiveLimits {
    fn default() -> Self {
        Self {
            max_archive_size: 512 * 1024 * 1024,
            max_entries: 100_000,
            max_entry_size: 64 * 1024 * 1024,
            max_total_size: 1024 * 1024 * 1024,
            max_compression_ratio: 200,
        }
    }
}

#[derive(Debug, Error)]
pub enum ArchiveError {
    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("archive I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("archive contains {actual} entries, limit is {limit}")]
    TooManyEntries { actual: usize, limit: usize },
    #[error("ZIP container is {actual} bytes, limit is {limit}")]
    ContainerTooLarge { actual: u64, limit: u64 },
    #[error("invalid ZIP central directory: {0}")]
    InvalidCentralDirectory(String),
    #[error("invalid ZIP entry name: {0:?}")]
    InvalidEntryName(String),
    #[error("duplicate ZIP entry name: {0}")]
    DuplicateEntry(String),
    #[error("unsupported ZIP compression method for {name}: {method:?}")]
    UnsupportedCompression {
        name: String,
        method: CompressionMethod,
    },
    #[error("encrypted ZIP entry is not supported: {0}")]
    EncryptedEntry(String),
    #[error("ZIP entry {name} expands to {actual} bytes, limit is {limit}")]
    EntryTooLarge {
        name: String,
        actual: u64,
        limit: u64,
    },
    #[error("ZIP entries expand to {actual} bytes in total, limit is {limit}")]
    ArchiveTooLarge { actual: u64, limit: u64 },
    #[error("ZIP entry {name} exceeds compression ratio limit {limit}:1")]
    SuspiciousCompressionRatio { name: String, limit: u64 },
    #[error("archive is missing required entry {0}")]
    MissingRequiredEntry(&'static str),
}

pub type ArchiveResult<T> = std::result::Result<T, ArchiveError>;

/// Reads an archive into memory after validating every entry and resource limit.
///
/// Higher layers parse the manifest first and retain only referenced entries
/// when streaming is introduced. Keeping this boundary generic makes the safety
/// rules independently testable now.
pub fn read_entries<R: Read + Seek>(
    mut reader: R,
    limits: ArchiveLimits,
) -> ArchiveResult<BTreeMap<String, Vec<u8>>> {
    let archive_size = reader.seek(SeekFrom::End(0))?;
    if archive_size > limits.max_archive_size {
        return Err(ArchiveError::ContainerTooLarge {
            actual: archive_size,
            limit: limits.max_archive_size,
        });
    }
    reader.seek(SeekFrom::Start(0))?;
    let mut raw = Vec::with_capacity(archive_size as usize);
    reader.read_to_end(&mut raw)?;
    validate_central_directory(&raw, limits.max_entries)?;

    let mut archive = ZipArchive::new(Cursor::new(raw))?;
    if archive.len() > limits.max_entries {
        return Err(ArchiveError::TooManyEntries {
            actual: archive.len(),
            limit: limits.max_entries,
        });
    }

    let mut names = HashSet::with_capacity(archive.len());
    let mut total_size = 0_u64;
    let mut entries = BTreeMap::new();

    for index in 0..archive.len() {
        let mut file = archive.by_index(index)?;
        let name = file.name().to_owned();
        if !is_valid_entry_name(&name) || file.enclosed_name().is_none() {
            return Err(ArchiveError::InvalidEntryName(name));
        }
        if !names.insert(name.clone()) {
            return Err(ArchiveError::DuplicateEntry(name));
        }

        if file.encrypted() {
            return Err(ArchiveError::EncryptedEntry(name));
        }

        let compression = file.compression();
        match compression {
            CompressionMethod::Stored | CompressionMethod::Deflated => {}
            method => {
                return Err(ArchiveError::UnsupportedCompression { name, method });
            }
        }
        if name.ends_with(".json") && compression != CompressionMethod::Deflated {
            return Err(ArchiveError::UnsupportedCompression {
                name,
                method: compression,
            });
        }

        let size = file.size();
        if size > limits.max_entry_size {
            return Err(ArchiveError::EntryTooLarge {
                name,
                actual: size,
                limit: limits.max_entry_size,
            });
        }
        total_size = total_size.saturating_add(size);
        if total_size > limits.max_total_size {
            return Err(ArchiveError::ArchiveTooLarge {
                actual: total_size,
                limit: limits.max_total_size,
            });
        }

        let compressed_size = file.compressed_size();
        if size > 0
            && (compressed_size == 0
                || size > compressed_size.saturating_mul(limits.max_compression_ratio))
        {
            return Err(ArchiveError::SuspiciousCompressionRatio {
                name,
                limit: limits.max_compression_ratio,
            });
        }

        let capacity = usize::try_from(size).map_err(|_| ArchiveError::EntryTooLarge {
            name: name.clone(),
            actual: size,
            limit: limits.max_entry_size,
        })?;
        let mut data = Vec::with_capacity(capacity);
        file.read_to_end(&mut data)?;
        entries.insert(name, data);
    }

    if !entries.contains_key("manifest.json") {
        return Err(ArchiveError::MissingRequiredEntry("manifest.json"));
    }
    Ok(entries)
}

/// Writes entries in lexical order with fixed metadata for reproducible output.
pub fn write_entries<W: Write + Seek>(
    writer: W,
    entries: &BTreeMap<String, Vec<u8>>,
) -> ArchiveResult<W> {
    if !entries.contains_key("manifest.json") {
        return Err(ArchiveError::MissingRequiredEntry("manifest.json"));
    }

    let mut zip = ZipWriter::new(writer);
    for (name, data) in entries {
        if !is_valid_entry_name(name) {
            return Err(ArchiveError::InvalidEntryName(name.clone()));
        }
        let method = if name.ends_with(".bin") {
            CompressionMethod::Stored
        } else {
            CompressionMethod::Deflated
        };
        let options = SimpleFileOptions::DEFAULT
            .compression_method(method)
            .unix_permissions(0o644);
        zip.start_file(name, options)?;
        zip.write_all(data)?;
    }
    Ok(zip.finish()?)
}

pub fn is_valid_entry_name(name: &str) -> bool {
    if name.is_empty()
        || name.starts_with('/')
        || name.ends_with('/')
        || name.contains('\\')
        || name.contains('\0')
    {
        return false;
    }
    if name.as_bytes().get(1) == Some(&b':') && name.as_bytes()[0].is_ascii_alphabetic() {
        return false;
    }
    name.split('/')
        .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

fn validate_central_directory(raw: &[u8], max_entries: usize) -> ArchiveResult<()> {
    const EOCD_SIGNATURE: &[u8; 4] = b"PK\x05\x06";
    const CENTRAL_SIGNATURE: &[u8; 4] = b"PK\x01\x02";
    const MAX_EOCD_SEARCH: usize = 65_557;

    let search_start = raw.len().saturating_sub(MAX_EOCD_SEARCH);
    let eocd = raw[search_start..]
        .windows(EOCD_SIGNATURE.len())
        .rposition(|window| window == EOCD_SIGNATURE)
        .map(|position| search_start + position)
        .ok_or_else(|| ArchiveError::InvalidCentralDirectory("missing EOCD record".to_owned()))?;
    if eocd + 22 > raw.len() {
        return Err(ArchiveError::InvalidCentralDirectory(
            "truncated EOCD record".to_owned(),
        ));
    }
    let disk = read_u16(raw, eocd + 4)?;
    let central_disk = read_u16(raw, eocd + 6)?;
    if disk != 0 || central_disk != 0 {
        return Err(ArchiveError::InvalidCentralDirectory(
            "multi-disk ZIP archives are not supported".to_owned(),
        ));
    }
    let entries_on_disk = read_u16(raw, eocd + 8)? as usize;
    let entry_count = read_u16(raw, eocd + 10)? as usize;
    if entries_on_disk != entry_count {
        return Err(ArchiveError::InvalidCentralDirectory(
            "central directory entry counts disagree".to_owned(),
        ));
    }
    if entry_count == u16::MAX as usize {
        return Err(ArchiveError::InvalidCentralDirectory(
            "ZIP64 central directories are not supported".to_owned(),
        ));
    }
    if entry_count > max_entries {
        return Err(ArchiveError::TooManyEntries {
            actual: entry_count,
            limit: max_entries,
        });
    }

    let central_size = read_u32(raw, eocd + 12)? as usize;
    let central_start = read_u32(raw, eocd + 16)? as usize;
    let central_end = central_start.checked_add(central_size).ok_or_else(|| {
        ArchiveError::InvalidCentralDirectory("central directory size overflow".to_owned())
    })?;
    if central_end > eocd || central_end > raw.len() {
        return Err(ArchiveError::InvalidCentralDirectory(
            "central directory lies outside the container".to_owned(),
        ));
    }

    let mut cursor = central_start;
    let mut names = HashSet::with_capacity(entry_count);
    for _ in 0..entry_count {
        if raw.get(cursor..cursor + 4) != Some(CENTRAL_SIGNATURE) {
            return Err(ArchiveError::InvalidCentralDirectory(
                "missing central file header".to_owned(),
            ));
        }
        if cursor + 46 > central_end {
            return Err(ArchiveError::InvalidCentralDirectory(
                "truncated central file header".to_owned(),
            ));
        }
        let name_len = read_u16(raw, cursor + 28)? as usize;
        let extra_len = read_u16(raw, cursor + 30)? as usize;
        let comment_len = read_u16(raw, cursor + 32)? as usize;
        let name_start = cursor + 46;
        let name_end = name_start.checked_add(name_len).ok_or_else(|| {
            ArchiveError::InvalidCentralDirectory("entry name length overflow".to_owned())
        })?;
        let next = name_end
            .checked_add(extra_len)
            .and_then(|value| value.checked_add(comment_len))
            .ok_or_else(|| {
                ArchiveError::InvalidCentralDirectory("entry header length overflow".to_owned())
            })?;
        if next > central_end {
            return Err(ArchiveError::InvalidCentralDirectory(
                "central entry exceeds directory bounds".to_owned(),
            ));
        }
        let name_bytes = &raw[name_start..name_end];
        let name = std::str::from_utf8(name_bytes).map_err(|_| {
            ArchiveError::InvalidCentralDirectory("entry name is not UTF-8".to_owned())
        })?;
        if !names.insert(name_bytes.to_vec()) {
            return Err(ArchiveError::DuplicateEntry(name.to_owned()));
        }
        cursor = next;
    }
    if cursor != central_end {
        return Err(ArchiveError::InvalidCentralDirectory(
            "central directory contains trailing records".to_owned(),
        ));
    }
    Ok(())
}

fn read_u16(raw: &[u8], offset: usize) -> ArchiveResult<u16> {
    let bytes: [u8; 2] = raw
        .get(offset..offset + 2)
        .ok_or_else(|| ArchiveError::InvalidCentralDirectory("truncated integer".to_owned()))?
        .try_into()
        .expect("slice length was checked");
    Ok(u16::from_le_bytes(bytes))
}

fn read_u32(raw: &[u8], offset: usize) -> ArchiveResult<u32> {
    let bytes: [u8; 4] = raw
        .get(offset..offset + 4)
        .ok_or_else(|| ArchiveError::InvalidCentralDirectory("truncated integer".to_owned()))?
        .try_into()
        .expect("slice length was checked");
    Ok(u32::from_le_bytes(bytes))
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    fn minimal_entries() -> BTreeMap<String, Vec<u8>> {
        BTreeMap::from([
            (
                "manifest.json".to_owned(),
                br#"{"format":"glyphweave-map","version":3}"#.to_vec(),
            ),
            ("regions/0.0/chunks/a.bin".to_owned(), vec![0xE4]),
            ("regions/0.0/region.json".to_owned(), b"{}".to_vec()),
        ])
    }

    #[test]
    fn valid_names_are_stricter_than_normalized_paths() {
        for name in [
            "",
            "/manifest.json",
            "../manifest.json",
            "a/../manifest.json",
            "a//b",
            "a/./b",
            "a\\b",
            "C:/world.json",
            "directory/",
            "nul\0suffix",
        ] {
            assert!(!is_valid_entry_name(name), "accepted {name:?}");
        }
        assert!(is_valid_entry_name("regions/-1.0/chunks/abc.bin"));
    }

    #[test]
    fn deterministic_round_trip() {
        let entries = minimal_entries();
        let first = write_entries(Cursor::new(Vec::new()), &entries)
            .unwrap()
            .into_inner();
        let second = write_entries(Cursor::new(Vec::new()), &entries)
            .unwrap()
            .into_inner();
        assert_eq!(first, second);

        let decoded = read_entries(Cursor::new(first), ArchiveLimits::default()).unwrap();
        assert_eq!(decoded, entries);
    }

    #[test]
    fn manifest_is_required_for_read_and_write() {
        let entries = BTreeMap::from([("other.json".to_owned(), b"{}".to_vec())]);
        assert!(matches!(
            write_entries(Cursor::new(Vec::new()), &entries),
            Err(ArchiveError::MissingRequiredEntry("manifest.json"))
        ));

        let mut raw_zip = ZipWriter::new(Cursor::new(Vec::new()));
        raw_zip
            .start_file("other.json", SimpleFileOptions::DEFAULT)
            .unwrap();
        raw_zip.write_all(b"{}").unwrap();
        let cursor = raw_zip.finish().unwrap();
        assert!(matches!(
            read_entries(Cursor::new(cursor.into_inner()), ArchiveLimits::default()),
            Err(ArchiveError::MissingRequiredEntry("manifest.json"))
        ));
    }

    #[test]
    fn limits_are_checked_before_allocation() {
        let entries = minimal_entries();
        let bytes = write_entries(Cursor::new(Vec::new()), &entries)
            .unwrap()
            .into_inner();
        let limits = ArchiveLimits {
            max_entries: 2,
            ..ArchiveLimits::default()
        };
        assert!(matches!(
            read_entries(Cursor::new(bytes), limits),
            Err(ArchiveError::TooManyEntries {
                actual: 3,
                limit: 2
            })
        ));
    }
}
