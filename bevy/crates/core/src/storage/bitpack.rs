//! Little-endian bit packing for `.gemap` v3 palette indices.

use super::{StorageError, StorageResult};

pub const MAX_BITS_PER_INDEX: u8 = 32;

/// Returns the canonical number of bits needed for a non-empty palette.
pub fn minimal_bits(palette_len: usize) -> StorageResult<u8> {
    if palette_len == 0 {
        return Err(StorageError::EmptyPalette);
    }

    let maximum_index = palette_len - 1;
    let bits = usize::BITS - maximum_index.leading_zeros();
    Ok(bits.max(1) as u8)
}

pub fn packed_len(value_count: usize, bits: u8) -> StorageResult<usize> {
    validate_bits(bits)?;
    value_count
        .checked_mul(bits as usize)
        .and_then(|total_bits| total_bits.checked_add(7))
        .map(|rounded| rounded / 8)
        .ok_or(StorageError::InvalidPackedLength {
            expected: usize::MAX,
            actual: 0,
        })
}

/// Packs palette indices with the lowest bit of each value written first.
pub fn pack_indices(indices: &[u32], bits: u8, palette_len: usize) -> StorageResult<Vec<u8>> {
    validate_palette_width(bits, palette_len)?;
    let mut output = vec![0_u8; packed_len(indices.len(), bits)?];

    for (position, &index) in indices.iter().enumerate() {
        if index as usize >= palette_len {
            return Err(StorageError::PaletteIndexOutOfRange {
                position,
                index,
                palette_len,
            });
        }

        let start_bit = position * bits as usize;
        for value_bit in 0..bits as usize {
            if (index >> value_bit) & 1 == 0 {
                continue;
            }
            let target_bit = start_bit + value_bit;
            output[target_bit / 8] |= 1 << (target_bit % 8);
        }
    }

    Ok(output)
}

/// Decodes and validates exactly `value_count` palette indices.
pub fn unpack_indices(
    data: &[u8],
    bits: u8,
    palette_len: usize,
    value_count: usize,
) -> StorageResult<Vec<u32>> {
    validate_palette_width(bits, palette_len)?;
    let expected = packed_len(value_count, bits)?;
    if data.len() != expected {
        return Err(StorageError::InvalidPackedLength {
            expected,
            actual: data.len(),
        });
    }
    validate_padding(data, value_count, bits)?;

    let mut indices = Vec::with_capacity(value_count);
    for position in 0..value_count {
        let start_bit = position * bits as usize;
        let mut index = 0_u32;
        for value_bit in 0..bits as usize {
            let source_bit = start_bit + value_bit;
            let bit = (data[source_bit / 8] >> (source_bit % 8)) & 1;
            index |= u32::from(bit) << value_bit;
        }
        if index as usize >= palette_len {
            return Err(StorageError::PaletteIndexOutOfRange {
                position,
                index,
                palette_len,
            });
        }
        indices.push(index);
    }
    Ok(indices)
}

fn validate_bits(bits: u8) -> StorageResult<()> {
    if !(1..=MAX_BITS_PER_INDEX).contains(&bits) {
        return Err(StorageError::InvalidBits(bits));
    }
    Ok(())
}

fn validate_palette_width(bits: u8, palette_len: usize) -> StorageResult<()> {
    validate_bits(bits)?;
    let expected = minimal_bits(palette_len)?;
    if bits != expected {
        if bits < expected {
            return Err(StorageError::PaletteDoesNotFit { palette_len, bits });
        }
        return Err(StorageError::NonMinimalBits {
            palette_len,
            expected,
            actual: bits,
        });
    }
    Ok(())
}

fn validate_padding(data: &[u8], value_count: usize, bits: u8) -> StorageResult<()> {
    let used_bits = value_count * bits as usize;
    let remainder = used_bits % 8;
    if remainder == 0 || data.is_empty() {
        return Ok(());
    }
    let unused_mask = !((1_u8 << remainder) - 1);
    if data[data.len() - 1] & unused_mask != 0 {
        return Err(StorageError::NonZeroPadding);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minimal_width_is_canonical() {
        assert_eq!(minimal_bits(1), Ok(1));
        assert_eq!(minimal_bits(2), Ok(1));
        assert_eq!(minimal_bits(3), Ok(2));
        assert_eq!(minimal_bits(4), Ok(2));
        assert_eq!(minimal_bits(5), Ok(3));
        assert_eq!(minimal_bits(256), Ok(8));
        assert_eq!(minimal_bits(0), Err(StorageError::EmptyPalette));
    }

    #[test]
    fn example_four_values_pack_to_e4() {
        assert_eq!(pack_indices(&[0, 1, 2, 3], 2, 4).unwrap(), vec![0xE4]);
        assert_eq!(unpack_indices(&[0xE4], 2, 4, 4).unwrap(), vec![0, 1, 2, 3]);
    }

    #[test]
    fn indices_cross_byte_boundaries() {
        let values = [0, 1, 7, 3, 6, 2, 5];
        let packed = pack_indices(&values, 3, 8).unwrap();
        assert_eq!(unpack_indices(&packed, 3, 8, values.len()).unwrap(), values);
    }

    #[test]
    fn rejects_non_canonical_width_and_out_of_range_values() {
        assert_eq!(
            pack_indices(&[0], 3, 2),
            Err(StorageError::NonMinimalBits {
                palette_len: 2,
                expected: 1,
                actual: 3,
            })
        );
        assert_eq!(
            pack_indices(&[2], 1, 2),
            Err(StorageError::PaletteIndexOutOfRange {
                position: 0,
                index: 2,
                palette_len: 2,
            })
        );
    }

    #[test]
    fn rejects_non_zero_padding() {
        assert_eq!(
            unpack_indices(&[0b1111_1110], 1, 2, 1),
            Err(StorageError::NonZeroPadding)
        );
    }

    #[test]
    fn round_trips_many_widths() {
        for palette_len in 1..=257 {
            let bits = minimal_bits(palette_len).unwrap();
            let values: Vec<u32> = (0..4096)
                .map(|index| (index % palette_len) as u32)
                .collect();
            let packed = pack_indices(&values, bits, palette_len).unwrap();
            assert_eq!(
                packed.len(),
                (4096 * bits as usize).div_ceil(8),
                "palette length {palette_len}"
            );
            assert_eq!(
                unpack_indices(&packed, bits, palette_len, values.len()).unwrap(),
                values,
                "palette length {palette_len}"
            );
        }
    }
}
