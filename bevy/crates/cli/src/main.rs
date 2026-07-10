use std::collections::BTreeMap;
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};

use glyphweave_core::migration::{MigrationMode, migrate_legacy_json};
use glyphweave_core::storage::archive::ArchiveLimits;
use glyphweave_core::storage::codec::{
    decode_world, decode_world_with_metadata, encode_world_with_metadata,
};

type CliResult<T> = Result<T, Box<dyn Error>>;

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

fn parse_mode(value: &str) -> CliResult<MigrationMode> {
    match value {
        "flatten" => Ok(MigrationMode::Flatten),
        "preserve-layers" => Ok(MigrationMode::PreserveLayers),
        _ => Err(format!("unsupported migration mode {value:?}").into()),
    }
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
        "Usage:\n  glyphweave convert [--mode flatten|preserve-layers] INPUT OUTPUT\n  glyphweave inspect FILE\n  glyphweave validate FILE\n  glyphweave compact FILE"
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
}
