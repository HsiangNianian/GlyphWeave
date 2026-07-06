mod resource;

use bevy::asset::AssetPlugin;
use bevy::diagnostic::FrameTimeDiagnosticsPlugin;
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::TilemapPlugin;
use bevy_egui::{egui, EguiContexts, EguiPlugin, EguiPrimaryContextPass};
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
                    // Smoke commands run from the repo root via --manifest-path, so the
                    // atlas at bevy/assets/textures/atlas.png resolves correctly.
                    file_path: "bevy/assets".to_string(),
                    ..default()
                }),
        )
        .add_plugins(FrameTimeDiagnosticsPlugin::default())
        .add_plugins(EguiPlugin::default())
        .add_plugins(TilemapPlugin)
        .add_message::<EditEvent>()
        .init_resource::<CursorTile>()
        .insert_resource(ActiveBrush(TileKind::Floor))
        .add_systems(Startup, (spawn_camera, load_initial_world).chain())
        .add_systems(EguiPrimaryContextPass, fps_overlay)
        .run();
}

fn spawn_camera(mut commands: Commands) {
    commands.spawn(Camera2d);
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
            w
        }
        Err(e) => {
            eprintln!(
                "[glyphweave] failed to load {}: {e}; starting empty",
                p.display()
            );
            glyphweave_core::world::World::default()
        }
    };
    commands.insert_resource(WorldModel(world));
}

fn fps_overlay(
    mut contexts: EguiContexts,
    diagnostics: Res<bevy::diagnostic::DiagnosticsStore>,
) {
    let fps = diagnostics
        .get(&FrameTimeDiagnosticsPlugin::FPS)
        .and_then(|d| d.smoothed())
        .map(|v| format!("{v:.1}"))
        .unwrap_or_else(|| "—".into());
    if let Ok(ctx) = contexts.ctx_mut() {
        egui::TopBottomPanel::top("fps").show(ctx, |ui| {
            ui.label(format!("FPS: {fps}"));
        });
    }
}
