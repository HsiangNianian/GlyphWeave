use bevy::diagnostic::{DiagnosticsStore, FrameTimeDiagnosticsPlugin};
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::TilemapPlugin;
use bevy_egui::{egui, EguiContexts, EguiPlugin, EguiPrimaryContextPass};

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
                .set(ImagePlugin::default_nearest()),
        )
        .add_plugins(FrameTimeDiagnosticsPlugin::default())
        .add_plugins(EguiPlugin::default())
        .add_plugins(TilemapPlugin)
        .add_systems(Startup, setup_camera)
        .add_systems(EguiPrimaryContextPass, fps_overlay)
        .run();
}

fn setup_camera(mut commands: Commands) {
    commands.spawn(Camera2d);
}

fn fps_overlay(mut contexts: EguiContexts, diagnostics: Res<DiagnosticsStore>) {
    let fps = diagnostics
        .get(&bevy::diagnostic::FrameTimeDiagnosticsPlugin::FPS)
        .and_then(|d| d.smoothed())
        .map(|v| format!("{v:.1}"))
        .unwrap_or_else(|| "—".into());
    if let Ok(ctx) = contexts.ctx_mut() {
        egui::TopBottomPanel::top("fps").show(ctx, |ui| {
            ui.label(format!("FPS: {fps}"));
        });
    }
}
