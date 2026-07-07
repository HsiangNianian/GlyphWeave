mod camera;
mod input;
mod perf;
mod preset;
mod render;
mod render_sync;
mod resource;
mod tool;
mod ui;

use bevy::asset::AssetPlugin;
use bevy::diagnostic::FrameTimeDiagnosticsPlugin;
use bevy::prelude::*;
use bevy::window::PresentMode;
use bevy::winit::WinitSettings;
use bevy_ecs_tilemap::prelude::TilemapPlugin;
use bevy_egui::{EguiPlugin, EguiPrimaryContextPass};
use glyphweave_core::gemap::load_world;
use glyphweave_core::tile::TileKind;
use perf::StartupOptions;
use resource::{
    ActivePreset, ActiveTheme, CursorTile, EditEvent, EditorHistory, EditorTool,
    EditorViewSettings, WorldModel, WorldRevision,
};

/// Which kind the Brush tool paints. B = Floor, E = Void (erase semantics).
#[derive(Resource, Debug, Clone, Copy)]
pub struct ActiveBrush(pub TileKind);

fn main() {
    let startup_options = StartupOptions::from_env();
    let perf_check = startup_options.perf_check.clone();
    let perf_mode = perf_check.is_some();
    let no_vsync = startup_options.no_vsync;
    let present_mode = if startup_options.no_vsync {
        PresentMode::AutoNoVsync
    } else {
        PresentMode::AutoVsync
    };

    let mut app = App::new();
    app.add_plugins(
        DefaultPlugins
            .set(WindowPlugin {
                primary_window: Some(Window {
                    title: "GlyphWeave".into(),
                    resolution: bevy::window::WindowResolution::new(1280, 720),
                    present_mode,
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
    .add_plugins(TilemapPlugin)
    .add_plugins(EguiPlugin::default())
    .add_message::<EditEvent>()
    .init_resource::<CursorTile>()
    .init_resource::<EditorTool>()
    .init_resource::<ActivePreset>()
    .init_resource::<EditorHistory>()
    .init_resource::<EditorViewSettings>()
    .init_resource::<WorldRevision>()
    .init_resource::<perf::PerfCheckState>()
    .insert_resource(ActiveBrush(TileKind::Wall))
    .insert_resource(ActiveTheme("ansi-16".into()))
    .insert_resource(startup_options)
    .init_resource::<render::tilemap::TileEntities>()
    .init_resource::<render::tilemap::RenderRefresh>()
    .init_resource::<ui::CurrentMapPath>()
    .register_type::<render::tilemap::TilemapLayer>()
    .add_systems(
        Startup,
        (
            camera::spawn_camera,
            render::atlas::load_atlas,
            load_initial_world,
            camera::center_camera_on_world,
            render::tilemap::spawn_tilemaps,
        )
            .chain(),
    )
    .add_systems(
        Update,
        (
            perf::perf_motion_system,
            render::tilemap::refresh_when_camera_bounds_change,
            render::tilemap::refresh_tilemaps,
            render::tilemap::set_theme,
            render::tilemap::sync_layer_visibility,
        )
            .chain(),
    )
    .add_systems(EguiPrimaryContextPass, ui::ui_overlay);

    if !perf_mode {
        app.add_plugins(FrameTimeDiagnosticsPlugin::default())
            .add_systems(
                Update,
                (
                    input::update_cursor_tile,
                    tool::tool_system,
                    render_sync::sync_edits,
                )
                    .chain()
                    .run_if(not(bevy_egui::input::egui_wants_any_input)),
            )
            .add_systems(
                Update,
                (camera::pan_camera, camera::zoom_to_cursor)
                    .run_if(not(bevy_egui::input::egui_wants_any_pointer_input)),
            )
            .add_systems(Update, render::tilemap::draw_grid);
    }

    if no_vsync {
        app.insert_resource(WinitSettings::continuous());
    }

    if let Some(config) = perf_check {
        app.insert_resource(config)
            .add_systems(First, perf::perf_frame_start_system)
            .add_systems(Last, perf::perf_check_system);
    }

    app.run();
}

fn load_initial_world(mut commands: Commands, startup_options: Res<StartupOptions>) {
    let (world, path) = match &startup_options.map_path {
        Some(path) => match load_world(path) {
            Ok(world) => (world, Some(path.clone())),
            Err(err) => {
                eprintln!("glyphweave: failed to load {}: {err}", path.display());
                std::process::exit(2);
            }
        },
        None => (glyphweave_core::world::World::default(), None),
    };
    let theme_id = world.theme_id.clone();

    commands.insert_resource(ui::CurrentMapPath(path));
    commands.insert_resource(ActiveTheme(theme_id));
    commands.insert_resource(WorldModel(world));
    commands.insert_resource(WorldRevision(1));
}
