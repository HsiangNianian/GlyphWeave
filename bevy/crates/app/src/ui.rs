//! egui editor shell. The layout intentionally mirrors the React editor:
//! narrow tool rail, central canvas, right tabbed inspector, and small
//! floating status controls.
use crate::ActiveBrush;
use crate::render::MapBounds;
use crate::resource::{ActiveTheme, CursorTile, WorldModel};
use bevy::diagnostic::DiagnosticsStore;
use bevy::prelude::*;
use bevy_egui::{EguiContexts, egui};
use glyphweave_core::gemap::save_world;
use glyphweave_core::tile::TileKind;
use std::path::PathBuf;

/// Where the most recent load came from / where Save writes.
#[derive(Resource, Debug, Clone, Default)]
pub struct CurrentMapPath(pub Option<PathBuf>);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SideTab {
    Tiles,
    Presets,
    Layers,
    Export,
    Settings,
}

#[derive(Debug)]
pub struct EditorUiState {
    side_panel_open: bool,
    side_tab: SideTab,
}

impl Default for EditorUiState {
    fn default() -> Self {
        Self {
            side_panel_open: true,
            side_tab: SideTab::Tiles,
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn ui_overlay(
    mut contexts: EguiContexts,
    diagnostics: Res<DiagnosticsStore>,
    cursor: Res<CursorTile>,
    mut world_model: ResMut<WorldModel>,
    bounds: Option<Res<MapBounds>>,
    path: Res<CurrentMapPath>,
    mut active_brush: ResMut<ActiveBrush>,
    mut active_theme: ResMut<ActiveTheme>,
    mut ui_state: Local<EditorUiState>,
) {
    let fps = diagnostics
        .get(&bevy::diagnostic::FrameTimeDiagnosticsPlugin::FPS)
        .and_then(|d| d.smoothed())
        .map(|v| format!("{v:.1}"))
        .unwrap_or_else(|| "—".into());

    let Some(ctx) = contexts.ctx_mut().ok() else {
        return;
    };

    apply_editor_style(ctx);

    egui::SidePanel::left("tool_rail")
        .resizable(false)
        .exact_width(56.0)
        .frame(panel_frame())
        .show(ctx, |ui| {
            ui.vertical_centered(|ui| {
                ui.add_space(7.0);
                ui.label(
                    egui::RichText::new("GW")
                        .monospace()
                        .strong()
                        .color(zinc(100)),
                );
                ui.add_space(12.0);

                let brush_selected = active_brush.0 != TileKind::Void;
                if tool_button(ui, brush_selected, "B", "Brush").clicked()
                    && active_brush.0 == TileKind::Void
                {
                    active_brush.0 = TileKind::Floor;
                }

                if tool_button(ui, active_brush.0 == TileKind::Void, "E", "Erase").clicked() {
                    active_brush.0 = TileKind::Void;
                }

                ui.add_space(6.0);
                ui.separator();
                ui.add_space(6.0);

                disabled_tool_button(ui, "F", "Fill");
                disabled_tool_button(ui, "S", "Select");
                disabled_tool_button(ui, "U", "Undo");
                disabled_tool_button(ui, "R", "Redo");
            });
        });

    if ui_state.side_panel_open {
        egui::SidePanel::right("editor_side_panel")
            .resizable(false)
            .exact_width(224.0)
            .frame(panel_frame())
            .show(ctx, |ui| {
                side_tabs(ui, &mut ui_state.side_tab);
                ui.separator();
                ui.add_space(4.0);

                match ui_state.side_tab {
                    SideTab::Tiles => tiles_tab(ui, &mut active_brush),
                    SideTab::Presets => unavailable_tab(ui, "Presets"),
                    SideTab::Layers => layers_tab(ui, &mut world_model),
                    SideTab::Export => unavailable_tab(ui, "Export"),
                    SideTab::Settings => {
                        settings_tab(ui, &mut world_model, &mut active_theme, &path)
                    }
                }
            });
    }

    egui::Area::new(egui::Id::new("editor_status"))
        .anchor(egui::Align2::LEFT_TOP, egui::vec2(68.0, 12.0))
        .order(egui::Order::Foreground)
        .show(ctx, |ui| {
            floating_frame().show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new(&world_model.world_name).strong());
                    ui.separator();
                    ui.label(format!("FPS {fps}"));
                    ui.separator();
                    if cursor.valid {
                        ui.label(format!("{}, {}", cursor.x, cursor.y));
                    } else {
                        ui.label("tile --");
                    }
                    if let Some(b) = bounds.as_deref() {
                        ui.separator();
                        ui.label(format!("{}x{}", b.width, b.height));
                    }
                    ui.separator();
                    ui.label(active_brush.0.id());
                });
            });
        });

    egui::Area::new(egui::Id::new("side_panel_toggle"))
        .anchor(egui::Align2::RIGHT_BOTTOM, egui::vec2(-12.0, -12.0))
        .order(egui::Order::Foreground)
        .show(ctx, |ui| {
            let label = if ui_state.side_panel_open { ">" } else { "<" };
            let response = ui.add(
                egui::Button::new(label)
                    .min_size(egui::vec2(30.0, 30.0))
                    .corner_radius(4),
            );
            if response.clicked() {
                ui_state.side_panel_open = !ui_state.side_panel_open;
            }
        });
}

fn apply_editor_style(ctx: &egui::Context) {
    let mut visuals = egui::Visuals::dark();
    visuals.panel_fill = zinc(950);
    visuals.window_fill = zinc(950);
    visuals.extreme_bg_color = egui::Color32::BLACK;
    visuals.faint_bg_color = zinc(900);
    visuals.widgets.noninteractive.bg_fill = zinc(950);
    visuals.widgets.noninteractive.fg_stroke.color = zinc(400);
    visuals.widgets.inactive.bg_fill = zinc(900);
    visuals.widgets.inactive.bg_stroke.color = zinc(800);
    visuals.widgets.inactive.fg_stroke.color = zinc(300);
    visuals.widgets.hovered.bg_fill = zinc(800);
    visuals.widgets.hovered.bg_stroke.color = zinc(700);
    visuals.widgets.active.bg_fill = zinc(700);
    visuals.widgets.active.bg_stroke.color = zinc(500);
    visuals.selection.bg_fill = zinc(700);
    visuals.selection.stroke.color = zinc(100);
    ctx.set_visuals(visuals);

    let mut style = (*ctx.style()).clone();
    style.spacing.item_spacing = egui::vec2(6.0, 6.0);
    style.spacing.button_padding = egui::vec2(8.0, 5.0);
    ctx.set_style(style);
}

fn panel_frame() -> egui::Frame {
    egui::Frame::new()
        .fill(zinc(950))
        .stroke(egui::Stroke::new(1.0, zinc(800)))
        .inner_margin(egui::Margin::symmetric(8, 8))
}

fn floating_frame() -> egui::Frame {
    egui::Frame::new()
        .fill(egui::Color32::from_rgba_premultiplied(0, 0, 0, 190))
        .stroke(egui::Stroke::new(1.0, zinc(800)))
        .corner_radius(egui::CornerRadius::same(4))
        .inner_margin(egui::Margin::symmetric(8, 5))
}

fn tool_button(
    ui: &mut egui::Ui,
    selected: bool,
    label: &'static str,
    tooltip: &'static str,
) -> egui::Response {
    ui.add(
        egui::Button::new(egui::RichText::new(label).monospace().strong())
            .selected(selected)
            .min_size(egui::vec2(36.0, 36.0))
            .corner_radius(4),
    )
    .on_hover_text(tooltip)
}

fn disabled_tool_button(ui: &mut egui::Ui, label: &'static str, tooltip: &'static str) {
    ui.add_enabled(
        false,
        egui::Button::new(egui::RichText::new(label).monospace())
            .min_size(egui::vec2(36.0, 36.0))
            .corner_radius(4),
    )
    .on_disabled_hover_text(tooltip);
}

fn side_tabs(ui: &mut egui::Ui, active: &mut SideTab) {
    ui.horizontal_wrapped(|ui| {
        tab_button(ui, active, SideTab::Tiles, "Tiles");
        tab_button(ui, active, SideTab::Presets, "Presets");
        tab_button(ui, active, SideTab::Layers, "Layers");
        tab_button(ui, active, SideTab::Export, "Export");
        tab_button(ui, active, SideTab::Settings, "Settings");
    });
}

fn tab_button(ui: &mut egui::Ui, active: &mut SideTab, tab: SideTab, label: &'static str) {
    let selected = *active == tab;
    if ui
        .add(
            egui::Button::new(egui::RichText::new(label).size(11.0))
                .selected(selected)
                .corner_radius(3),
        )
        .clicked()
    {
        *active = tab;
    }
}

fn tiles_tab(ui: &mut egui::Ui, active_brush: &mut ResMut<ActiveBrush>) {
    ui.heading("Tiles");
    ui.add_space(2.0);
    egui::ScrollArea::vertical().show(ui, |ui| {
        for (label, kinds) in TILE_GROUPS {
            ui.label(egui::RichText::new(label).size(11.0).color(zinc(500)));
            ui.add_space(2.0);
            ui.horizontal_wrapped(|ui| {
                for kind in kinds {
                    let selected = active_brush.0 == *kind;
                    let text = format!("{} {}", kind.glyph(), kind.id());
                    if ui
                        .add(
                            egui::Button::new(egui::RichText::new(text).monospace().size(12.0))
                                .selected(selected)
                                .corner_radius(3),
                        )
                        .clicked()
                    {
                        active_brush.0 = *kind;
                    }
                }
            });
            ui.add_space(8.0);
        }
    });
}

fn layers_tab(ui: &mut egui::Ui, world_model: &mut ResMut<WorldModel>) {
    ui.heading("Layers");
    ui.add_space(2.0);

    let active = world_model.active_layer.clone();
    let mut rows: Vec<(usize, String, String, bool, bool)> = world_model
        .layers
        .iter()
        .enumerate()
        .map(|(i, l)| (i, l.id.clone(), l.name.clone(), l.visible, l.locked))
        .collect();
    let mut new_active: Option<String> = None;

    for (i, id, name, vis, lock) in &mut rows {
        let is_active = id.as_str() == active;
        egui::Frame::new()
            .fill(if is_active { zinc(850) } else { zinc(950) })
            .stroke(egui::Stroke::new(
                1.0,
                if is_active { zinc(700) } else { zinc(900) },
            ))
            .corner_radius(egui::CornerRadius::same(4))
            .inner_margin(egui::Margin::symmetric(6, 5))
            .show(ui, |ui| {
                if ui
                    .add(
                        egui::Button::new(format!("{}: {}", i, name))
                            .selected(is_active)
                            .corner_radius(3),
                    )
                    .clicked()
                {
                    new_active = Some(id.clone());
                }
                ui.horizontal(|ui| {
                    ui.checkbox(vis, "vis");
                    ui.checkbox(lock, "lock");
                });
            });
    }

    for (i, _, _, vis, lock) in rows {
        if let Some(layer) = world_model.layers.get_mut(i) {
            layer.visible = vis;
            layer.locked = lock;
        }
    }
    if let Some(active_layer) = new_active {
        world_model.active_layer = active_layer;
    }
}

fn settings_tab(
    ui: &mut egui::Ui,
    world_model: &mut ResMut<WorldModel>,
    active_theme: &mut ResMut<ActiveTheme>,
    path: &Res<CurrentMapPath>,
) {
    ui.heading("Settings");
    ui.add_space(8.0);

    ui.label(egui::RichText::new("Theme").size(11.0).color(zinc(500)));
    ui.horizontal(|ui| {
        if ui
            .add(egui::Button::new("ANSI-16").selected(active_theme.0 == "ansi-16"))
            .clicked()
        {
            active_theme.0 = "ansi-16".into();
            world_model.theme_id = "ansi-16".into();
        }
        if ui
            .add(egui::Button::new("Cogmind").selected(active_theme.0 == "cogmind"))
            .clicked()
        {
            active_theme.0 = "cogmind".into();
            world_model.theme_id = "cogmind".into();
        }
    });

    ui.add_space(12.0);
    ui.label(egui::RichText::new("File").size(11.0).color(zinc(500)));
    if ui.button("Save .gemap").clicked() {
        let target = path
            .0
            .clone()
            .unwrap_or_else(|| PathBuf::from("glyphweave_save.gemap"));
        match save_world(&world_model.0, &target) {
            Ok(()) => println!("[glyphweave] saved {}", target.display()),
            Err(e) => eprintln!("[glyphweave] save failed: {e}"),
        }
    }
}

fn unavailable_tab(ui: &mut egui::Ui, title: &'static str) {
    ui.heading(title);
    ui.add_space(8.0);
    ui.label(egui::RichText::new("Not available in the Bevy port yet.").color(zinc(500)));
}

fn zinc(shade: u16) -> egui::Color32 {
    match shade {
        100 => egui::Color32::from_rgb(244, 244, 245),
        200 => egui::Color32::from_rgb(228, 228, 231),
        300 => egui::Color32::from_rgb(212, 212, 216),
        400 => egui::Color32::from_rgb(161, 161, 170),
        500 => egui::Color32::from_rgb(113, 113, 122),
        700 => egui::Color32::from_rgb(63, 63, 70),
        800 => egui::Color32::from_rgb(39, 39, 42),
        850 => egui::Color32::from_rgb(32, 32, 35),
        900 => egui::Color32::from_rgb(24, 24, 27),
        950 => egui::Color32::from_rgb(9, 9, 11),
        _ => egui::Color32::from_rgb(24, 24, 27),
    }
}

const WALL_TILES: [TileKind; 5] = [
    TileKind::Wall,
    TileKind::Door,
    TileKind::DoorOpen,
    TileKind::Pillar,
    TileKind::Bar,
];
const FLOOR_TILES: [TileKind; 3] = [TileKind::Floor, TileKind::FloorAlt, TileKind::Bridge];
const WATER_TILES: [TileKind; 2] = [TileKind::Water, TileKind::DeepWater];
const TERRAIN_TILES: [TileKind; 2] = [TileKind::Void, TileKind::Lava];
const VEGETATION_TILES: [TileKind; 2] = [TileKind::Tree, TileKind::Grass];
const FURNITURE_TILES: [TileKind; 6] = [
    TileKind::Altar,
    TileKind::Fountain,
    TileKind::Shop,
    TileKind::Table,
    TileKind::Throne,
    TileKind::Cage,
];
const ITEM_TILES: [TileKind; 1] = [TileKind::Treasure];
const DECORATION_TILES: [TileKind; 3] = [TileKind::Grave, TileKind::Trap, TileKind::Blood];
const SPECIAL_TILES: [TileKind; 2] = [TileKind::StairsDown, TileKind::StairsUp];

const TILE_GROUPS: [(&str, &[TileKind]); 9] = [
    ("Walls", &WALL_TILES),
    ("Floors", &FLOOR_TILES),
    ("Water", &WATER_TILES),
    ("Terrain", &TERRAIN_TILES),
    ("Vegetation", &VEGETATION_TILES),
    ("Furniture", &FURNITURE_TILES),
    ("Items", &ITEM_TILES),
    ("Decorations", &DECORATION_TILES),
    ("Special", &SPECIAL_TILES),
];
