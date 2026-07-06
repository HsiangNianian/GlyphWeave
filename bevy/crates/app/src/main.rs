mod camera;
mod input;
mod render;
mod render_sync;
mod resource;
mod tool;
mod ui;

use bevy::asset::AssetPlugin;
use bevy::diagnostic::FrameTimeDiagnosticsPlugin;
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::TilemapPlugin;
use bevy_egui::{EguiPlugin, EguiPrimaryContextPass};
use glyphweave_core::gemap::load_world;
use glyphweave_core::tile::TileKind;
use resource::{CursorTile, EditEvent, WorldModel};
use std::path::PathBuf;

/// Which kind the Brush tool paints. B = Floor, E = Void (erase semantics).
#[derive(Resource, Debug, Clone, Copy)]
pub struct ActiveBrush(pub TileKind);

fn main() {
    App::new()
        .add_plugins(
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "GlyphWeave".into(),
                        resolution: bevy::window::WindowResolution::new(1280, 720),
                        ..default()
                    }),
                    ..default()
                })
                .set(ImagePlugin::default_nearest())
                .set(AssetPlugin {
                    // bevy 0.18 resolves file_path relative to the executable dir, not
                    // CWD, so pin it to an absolute path derived from the crate manifest.
                    file_path: format!("{}/../../assets", env!("CARGO_MANIFEST_DIR")),
                    ..default()
                }),
        )
        .add_plugins(FrameTimeDiagnosticsPlugin::default())
        .add_plugins(EguiPlugin::default())
        .add_plugins(TilemapPlugin)
        .add_message::<EditEvent>()
        .init_resource::<CursorTile>()
        .insert_resource(ActiveBrush(TileKind::Floor))
        .init_resource::<render::tilemap::TileEntities>()
        .init_resource::<ui::CurrentMapPath>()
        .register_type::<render::tilemap::TilemapLayer>()
        .add_systems(
            Startup,
            (
                camera::spawn_camera,
                render::atlas::load_atlas,
                load_initial_world,
                render::tilemap::spawn_tilemaps,
            )
                .chain(),
        )
        .add_systems(EguiPrimaryContextPass, ui::ui_overlay)
        .add_systems(
            Update,
            (input::update_cursor_tile, tool::tool_system, render_sync::sync_edits)
                .chain()
                .run_if(not(bevy_egui::input::egui_wants_any_pointer_input)),
        )
        .add_systems(
            Update,
            (camera::pan_camera, camera::zoom_to_cursor)
                .run_if(not(bevy_egui::input::egui_wants_any_pointer_input)),
        )
        .run();
}

fn load_initial_world(mut commands: Commands) {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop();
    p.pop();
    p.pop(); // repo root
    p.push("examples");
    p.push("grand-realm-of-aethra.gemap");
    let world = match load_world(&p) {
        Ok(w) => {
            println!(
                "[glyphweave] loaded {} ({} layers)",
                p.display(),
                w.layers.len()
            );
            commands.insert_resource(ui::CurrentMapPath(Some(p.clone())));
            w
        }
        Err(e) => {
            eprintln!(
                "[glyphweave] failed to load {}: {e}; starting empty",
                p.display()
            );
            commands.insert_resource(ui::CurrentMapPath(Some(p.clone())));
            glyphweave_core::world::World::default()
        }
    };
    commands.insert_resource(WorldModel(world));
}
