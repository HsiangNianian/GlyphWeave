use std::collections::BTreeMap;
use std::error::Error;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use glyphweave_core::migration::{MigrationMode, migrate_legacy_json};
use glyphweave_core::storage::archive::{ArchiveLimits, read_entries};
use glyphweave_core::storage::bitpack::unpack_indices;
use glyphweave_core::storage::canonical::chunk_id;
use glyphweave_core::storage::codec::{
    decode_world, decode_world_with_metadata, encode_world_with_metadata,
};
use glyphweave_core::storage::model::{Manifest, RegionManifest};
use glyphweave_core::voxel::{
    CHUNK_VOLUME, ChunkCoord, LocalVoxelCoord, RegionChunkCoord, RegionCoord, VoxelCoord,
};

type CliResult<T> = Result<T, Box<dyn Error>>;
const DEFAULT_DUMP_LIMIT: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DumpSelector {
    Coord(VoxelCoord),
    Section(DumpSectionSelector),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DumpSectionSelector {
    region: RegionCoord,
    section: RegionChunkCoord,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DumpTarget {
    region: RegionCoord,
    section: RegionChunkCoord,
    selected_coord: Option<VoxelCoord>,
    selected_local: Option<LocalVoxelCoord>,
}

fn main() {
    if let Err(error) = run(std::env::args().skip(1).collect()) {
        eprintln!("glyphweave: {error}");
        std::process::exit(1);
    }
}

fn run(args: Vec<String>) -> CliResult<()> {
    let Some(command) = args.first().map(String::as_str) else {
        print_usage();
        return Err("missing command".into());
    };
    match command {
        "convert" => convert_command(&args[1..]),
        "dump-chunk" => dump_chunk_command(&args[1..]),
        "inspect" => inspect_command(&args[1..]),
        "validate" => validate_command(&args[1..]),
        "compact" => compact_command(&args[1..]),
        "help" | "--help" | "-h" => {
            print_usage();
            Ok(())
        }
        other => {
            print_usage();
            Err(format!("unknown command {other:?}").into())
        }
    }
}

fn convert_command(args: &[String]) -> CliResult<()> {
    let mut mode = MigrationMode::Flatten;
    let mut paths = Vec::new();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--mode" => {
                let value = args.get(index + 1).ok_or("--mode requires a value")?;
                mode = parse_mode(value)?;
                index += 2;
            }
            option if option.starts_with('-') => {
                return Err(format!("unknown convert option {option:?}").into());
            }
            path => {
                paths.push(PathBuf::from(path));
                index += 1;
            }
        }
    }
    if paths.len() != 2 {
        return Err("convert requires INPUT and OUTPUT paths".into());
    }

    let input = fs::read(&paths[0])?;
    if input.starts_with(b"PK") {
        return Err(
            "convert expects a legacy JSON .gemap; input is already a ZIP container".into(),
        );
    }
    let migrated = migrate_legacy_json(&input, mode)?;
    let metadata = BTreeMap::from([(
        "migration".to_owned(),
        serde_json::json!({
            "sourceFormat": format!("gemap-v{}", migrated.report.source_version),
            "mode": migrated.report.mode,
            "layerZ": migrated.layer_z,
            "report": migrated.report,
        }),
    )]);
    let encoded = encode_world_with_metadata(&migrated.world, Some(metadata.clone()))?;
    write_atomic(&paths[1], &encoded)?;
    println!("{}", serde_json::to_string_pretty(&metadata["migration"])?);
    Ok(())
}

fn dump_chunk_command(args: &[String]) -> CliResult<()> {
    let mut selector = None;
    let mut limit = Some(DEFAULT_DUMP_LIMIT);
    let mut paths = Vec::new();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--coord" => {
                if selector.is_some() {
                    return Err("dump-chunk accepts only one selector".into());
                }
                let value = args.get(index + 1).ok_or("--coord requires z,x,y")?;
                selector = Some(DumpSelector::Coord(parse_world_coord(value)?));
                index += 2;
            }
            "--section" => {
                if selector.is_some() {
                    return Err("dump-chunk accepts only one selector".into());
                }
                let value = args
                    .get(index + 1)
                    .ok_or("--section requires cz,rx,ry,rcx,rcy")?;
                selector = Some(DumpSelector::Section(parse_section_selector(value)?));
                index += 2;
            }
            "--limit" => {
                let value = args.get(index + 1).ok_or("--limit requires a value")?;
                limit = Some(parse_limit(value)?);
                index += 2;
            }
            "--all" => {
                limit = None;
                index += 1;
            }
            option if option.starts_with('-') => {
                return Err(format!("unknown dump-chunk option {option:?}").into());
            }
            path => {
                paths.push(PathBuf::from(path));
                index += 1;
            }
        }
    }
    if paths.len() != 1 {
        return Err("dump-chunk requires exactly one FILE path".into());
    }
    let selector = selector.ok_or("dump-chunk requires --coord or --section")?;
    dump_chunk(&paths[0], dump_target(selector), limit)
}

fn inspect_command(args: &[String]) -> CliResult<()> {
    let path = one_path("inspect", args)?;
    let world = decode_world(&fs::read(path)?, ArchiveLimits::default())?;
    println!("name: {}", world.name);
    println!("voxels: {}", world.len());
    println!("regions: {}", world.region_count());
    println!("chunks: {}", world.chunk_count());
    println!("blocks: {}", world.registry().len());
    match world.bounds() {
        Some(bounds) => println!(
            "bounds: ({},{},{})..({},{},{})",
            bounds.min.z, bounds.min.x, bounds.min.y, bounds.max.z, bounds.max.x, bounds.max.y
        ),
        None => println!("bounds: empty"),
    }
    for (_, name) in world.registry().iter() {
        println!("block: {name}");
    }
    Ok(())
}

fn validate_command(args: &[String]) -> CliResult<()> {
    let path = one_path("validate", args)?;
    let world = decode_world(&fs::read(path)?, ArchiveLimits::default())?;
    println!(
        "valid .gemap v3: {} voxels, {} chunks",
        world.len(),
        world.chunk_count()
    );
    Ok(())
}

fn compact_command(args: &[String]) -> CliResult<()> {
    let path = one_path("compact", args)?;
    let decoded = decode_world_with_metadata(&fs::read(path)?, ArchiveLimits::default())?;
    let compacted = encode_world_with_metadata(&decoded.world, decoded.metadata)?;
    write_atomic(path, &compacted)?;
    println!("compacted {}", path.display());
    Ok(())
}

fn dump_chunk(path: &Path, target: DumpTarget, limit: Option<usize>) -> CliResult<()> {
    let bytes = fs::read(path)?;
    let entries = read_entries(Cursor::new(bytes), ArchiveLimits::default())?;
    let manifest_entry = entries
        .get("manifest.json")
        .ok_or("archive is missing manifest.json")?;
    let manifest: Manifest = serde_json::from_slice(manifest_entry)?;
    manifest.validate()?;

    let region_key = format!("{},{}", target.region.x, target.region.y);
    let section_key = section_key(target.section);
    let chunk_coord = ChunkCoord::from_region_local(target.region, target.section);
    let Some(region_path) = manifest.regions.get(&region_key) else {
        return print_absent_chunk(path, &target, "region is absent; chunk is all air");
    };
    let region_entry = entries
        .get(region_path)
        .ok_or_else(|| format!("archive is missing {region_path}"))?;
    let region_manifest: RegionManifest = serde_json::from_slice(region_entry)?;
    region_manifest.validate()?;
    if region_manifest.region != (target.region.x, target.region.y) {
        return Err(format!(
            "{region_path} declares region {:?}, expected ({},{})",
            region_manifest.region, target.region.x, target.region.y
        )
        .into());
    }

    let Some(chunk_id_value) = region_manifest.sections.get(&section_key) else {
        return print_absent_chunk(path, &target, "section is absent; chunk is all air");
    };
    let record = region_manifest.chunks.get(chunk_id_value).ok_or_else(|| {
        format!("section {section_key} references missing chunk {chunk_id_value}")
    })?;
    for block_id in &record.palette {
        if !manifest.block_registry.contains_key(block_id) {
            return Err(
                format!("chunk {chunk_id_value} uses unregistered block ID {block_id}").into(),
            );
        }
    }
    let region_dir = region_path
        .strip_suffix("region.json")
        .ok_or_else(|| format!("region path is not canonical: {region_path}"))?;
    let binary_path = format!("{region_dir}{}", record.data);
    let data = entries
        .get(&binary_path)
        .ok_or_else(|| format!("archive is missing {binary_path}"))?;
    let actual_id = chunk_id(&record.palette, record.bits, data);
    if actual_id != *chunk_id_value {
        return Err(format!("chunk {chunk_id_value} canonical ID is {actual_id}").into());
    }
    let indices = unpack_indices(data, record.bits, record.palette.len(), CHUNK_VOLUME)?;

    let selected_voxel = target.selected_local.map(|local| {
        let index = local.index();
        let palette_index = indices[index] as usize;
        let block_id = record.palette[palette_index];
        serde_json::json!({
            "coord": coord_json(target.selected_coord.expect("local implies selected coord")),
            "local": local_json(local),
            "index": index,
            "paletteIndex": palette_index,
            "blockId": block_id,
            "block": block_name(&manifest, block_id),
        })
    });

    let mut non_air_count = 0_usize;
    let mut non_air_voxels = Vec::new();
    for (index, palette_index) in indices.iter().enumerate() {
        let block_id = record.palette[*palette_index as usize];
        if block_id == 0 {
            continue;
        }
        non_air_count += 1;
        if limit.is_none_or(|max| non_air_voxels.len() < max) {
            let local = LocalVoxelCoord::from_index(index)
                .expect("indices below CHUNK_VOLUME are valid local coordinates");
            let coord = VoxelCoord::from_chunk_local(chunk_coord, local);
            non_air_voxels.push(serde_json::json!({
                "coord": coord_json(coord),
                "local": local_json(local),
                "index": index,
                "paletteIndex": palette_index,
                "blockId": block_id,
                "block": block_name(&manifest, block_id),
            }));
        }
    }

    let palette: Vec<_> = record
        .palette
        .iter()
        .map(|&block_id| {
            serde_json::json!({
                "id": block_id,
                "block": block_name(&manifest, block_id),
            })
        })
        .collect();
    let output = serde_json::json!({
        "kind": "glyphweave.gemap.chunkDump",
        "file": path.display().to_string(),
        "region": {
            "key": region_key,
            "coord": [target.region.x, target.region.y],
            "path": region_path,
        },
        "section": {
            "key": section_key,
            "coord": [target.section.z(), target.section.x(), target.section.y()],
        },
        "chunk": {
            "coord": [chunk_coord.z, chunk_coord.x, chunk_coord.y],
            "id": chunk_id_value,
            "path": binary_path,
            "bits": record.bits,
            "binaryBytes": data.len(),
            "palette": palette,
        },
        "selectedVoxel": selected_voxel,
        "nonAirVoxelCount": non_air_count,
        "nonAirVoxelsShown": non_air_voxels.len(),
        "truncated": limit.is_some_and(|max| non_air_count > max),
        "nonAirVoxels": non_air_voxels,
    });
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

fn parse_mode(value: &str) -> CliResult<MigrationMode> {
    match value {
        "flatten" => Ok(MigrationMode::Flatten),
        "preserve-layers" => Ok(MigrationMode::PreserveLayers),
        _ => Err(format!("unsupported migration mode {value:?}").into()),
    }
}

fn parse_world_coord(value: &str) -> CliResult<VoxelCoord> {
    let parts = parse_i32_list(value, 3, "world coordinate")?;
    Ok(VoxelCoord::new(parts[0], parts[1], parts[2]))
}

fn parse_section_selector(value: &str) -> CliResult<DumpSectionSelector> {
    let parts = parse_i32_list(value, 5, "section selector")?;
    let rcx = u8::try_from(parts[3])
        .ok()
        .and_then(|value| (value < 32).then_some(value))
        .ok_or("--section rcx must be in 0..31")?;
    let rcy = u8::try_from(parts[4])
        .ok()
        .and_then(|value| (value < 32).then_some(value))
        .ok_or("--section rcy must be in 0..31")?;
    let section =
        RegionChunkCoord::new(parts[0], rcx, rcy).ok_or("--section rcx/rcy must be in 0..31")?;
    Ok(DumpSectionSelector {
        section,
        region: RegionCoord::new(parts[1], parts[2]),
    })
}

fn parse_i32_list(value: &str, expected_len: usize, label: &str) -> CliResult<Vec<i32>> {
    let parts: Vec<_> = value.split(',').collect();
    if parts.len() != expected_len {
        return Err(format!("{label} must have {expected_len} comma-separated integers").into());
    }
    parts
        .iter()
        .map(|part| {
            part.parse::<i32>()
                .map_err(|_| format!("{label} contains invalid integer {part:?}").into())
        })
        .collect()
}

fn parse_limit(value: &str) -> CliResult<usize> {
    let limit = value
        .parse::<usize>()
        .map_err(|_| format!("--limit must be a non-negative integer, got {value:?}"))?;
    Ok(limit)
}

fn dump_target(selector: DumpSelector) -> DumpTarget {
    match selector {
        DumpSelector::Coord(coord) => {
            let (chunk, local) = coord.split();
            let (region, section) = chunk.split_region();
            DumpTarget {
                region,
                section,
                selected_coord: Some(coord),
                selected_local: Some(local),
            }
        }
        DumpSelector::Section(selector) => DumpTarget {
            region: selector.region,
            section: selector.section,
            selected_coord: None,
            selected_local: None,
        },
    }
}

fn section_key(section: RegionChunkCoord) -> String {
    format!("{},{},{}", section.z(), section.x(), section.y())
}

fn block_name(manifest: &Manifest, block_id: u32) -> String {
    manifest
        .block_registry
        .get(&block_id)
        .cloned()
        .unwrap_or_else(|| format!("<unregistered:{block_id}>"))
}

fn coord_json(coord: VoxelCoord) -> [i32; 3] {
    [coord.z, coord.x, coord.y]
}

fn local_json(local: LocalVoxelCoord) -> [u8; 3] {
    [local.z(), local.x(), local.y()]
}

fn print_absent_chunk(path: &Path, target: &DumpTarget, reason: &str) -> CliResult<()> {
    let chunk = ChunkCoord::from_region_local(target.region, target.section);
    let output = serde_json::json!({
        "kind": "glyphweave.gemap.chunkDump",
        "file": path.display().to_string(),
        "absent": true,
        "reason": reason,
        "region": {
            "key": format!("{},{}", target.region.x, target.region.y),
            "coord": [target.region.x, target.region.y],
            "path": format!("regions/{}.{}/region.json", target.region.x, target.region.y),
        },
        "section": {
            "key": section_key(target.section),
            "coord": [target.section.z(), target.section.x(), target.section.y()],
        },
        "chunk": {
            "coord": [chunk.z, chunk.x, chunk.y],
        },
        "selectedVoxel": target.selected_coord.map(|coord| serde_json::json!({
            "coord": coord_json(coord),
            "local": local_json(target.selected_local.expect("coord implies local")),
            "blockId": 0,
            "block": "glyphweave:air",
        })),
        "nonAirVoxelCount": 0,
        "nonAirVoxelsShown": 0,
        "truncated": false,
        "nonAirVoxels": [],
    });
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

fn one_path<'a>(command: &str, args: &'a [String]) -> CliResult<&'a Path> {
    if args.len() != 1 {
        return Err(format!("{command} requires exactly one path").into());
    }
    Ok(Path::new(&args[0]))
}

fn write_atomic(target: &Path, bytes: &[u8]) -> CliResult<()> {
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("output path must have a UTF-8 file name")?;
    let temporary = parent.join(format!(".{file_name}.tmp-{}", std::process::id()));

    let result = (|| -> std::io::Result<()> {
        fs::write(&temporary, bytes)?;
        let file = fs::OpenOptions::new().write(true).open(&temporary)?;
        file.sync_all()?;
        fs::rename(&temporary, target)?;
        if let Ok(directory) = fs::File::open(parent) {
            let _ = directory.sync_all();
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result?;
    Ok(())
}

fn print_usage() {
    eprintln!(
        "Usage:\n  glyphweave convert [--mode flatten|preserve-layers] INPUT OUTPUT\n  glyphweave dump-chunk (--coord z,x,y | --section cz,rx,ry,rcx,rcy) [--limit N|--all] FILE\n  glyphweave inspect FILE\n  glyphweave validate FILE\n  glyphweave compact FILE"
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_migration_modes() {
        assert_eq!(parse_mode("flatten").unwrap(), MigrationMode::Flatten);
        assert_eq!(
            parse_mode("preserve-layers").unwrap(),
            MigrationMode::PreserveLayers
        );
        assert!(parse_mode("layers-as-height").is_err());
    }

    #[test]
    fn validates_single_path_commands() {
        let paths = vec!["world.gemap".to_owned()];
        assert_eq!(
            one_path("validate", &paths).unwrap(),
            Path::new("world.gemap")
        );
        assert!(one_path("validate", &[]).is_err());
    }

    #[test]
    fn parses_dump_world_coordinate_to_region_section_and_local() {
        let target = dump_target(DumpSelector::Coord(
            parse_world_coord("-1,-1,-513").unwrap(),
        ));

        assert_eq!(target.region, RegionCoord::new(-1, -2));
        assert_eq!(target.section.z(), -1);
        assert_eq!(target.section.x(), 31);
        assert_eq!(target.section.y(), 31);
        assert_eq!(
            target.selected_local,
            Some(LocalVoxelCoord::new(15, 15, 15).unwrap())
        );
    }

    #[test]
    fn parses_dump_section_selector() {
        let selector = parse_section_selector("-2,3,-4,31,0").unwrap();

        assert_eq!(selector.region, RegionCoord::new(3, -4));
        assert_eq!(selector.section.z(), -2);
        assert_eq!(selector.section.x(), 31);
        assert_eq!(selector.section.y(), 0);
        assert!(parse_section_selector("0,0,0,32,0").is_err());
    }
}
