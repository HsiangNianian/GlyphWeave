//! egui editor shell. The layout intentionally mirrors the React editor:
//! narrow tool rail, central canvas, right tabbed inspector, and small
//! floating status controls.
use crate::ActiveBrush;
use crate::preset::{PRESETS, PresetCategory};
use crate::render::MapBounds;
use crate::render::tilemap::RenderRefresh;
use crate::resource::{
    ActivePreset, ActiveTheme, CursorTile, EditorHistory, EditorTool, EditorViewSettings,
    WorldModel, WorldRevision,
};
use crate::viewport::world_viewport_bounds_current;
use bevy::diagnostic::DiagnosticsStore;
use bevy::ecs::system::SystemParam;
use bevy::prelude::*;
use bevy_egui::{EguiContexts, egui};
use glyphweave_core::gemap::{load_world, save_world};
use glyphweave_core::layer::Layer;
use glyphweave_core::tile::TileKind;
use glyphweave_core::world::World;
use std::path::{Path, PathBuf};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EditorScreen {
    Home,
    Editor,
}

pub struct EditorUiState {
    screen: EditorScreen,
    side_panel_open: bool,
    side_tab: SideTab,
    preset_category: PresetCategory,
    path_text: String,
    status_message: String,
    home_world_name: String,
    home_tile_size: u32,
    home_theme_id: String,
    home_import_path: String,
    minimap_cache: MinimapCache,
    style_applied: bool,
}

#[derive(Default)]
struct MinimapCache {
    texture: Option<egui::TextureHandle>,
    signature: Option<MinimapSignature>,
    projection: Option<MinimapProjection>,
}

#[derive(Clone, PartialEq, Eq)]
struct MinimapSignature {
    world_revision: u64,
    theme_id: String,
}

#[derive(SystemParam)]
pub struct UiWorldParams<'w> {
    world_model: ResMut<'w, WorldModel>,
    world_revision: ResMut<'w, WorldRevision>,
}

impl Default for EditorUiState {
    fn default() -> Self {
        Self {
            screen: EditorScreen::Home,
            side_panel_open: true,
            side_tab: SideTab::Tiles,
            preset_category: PresetCategory::Rooms,
            path_text: String::new(),
            status_message: String::new(),
            home_world_name: "My Roguelike World".into(),
            home_tile_size: 24,
            home_theme_id: "ansi-16".into(),
            home_import_path: String::new(),
            minimap_cache: MinimapCache::default(),
            style_applied: false,
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn ui_overlay(
    mut contexts: EguiContexts,
    diagnostics: Res<DiagnosticsStore>,
    cursor: Res<CursorTile>,
    mut world: UiWorldParams,
    bounds: Option<Res<MapBounds>>,
    camera: Single<(&Projection, &mut Transform), With<Camera2d>>,
    window: Single<&Window>,
    mut path: ResMut<CurrentMapPath>,
    mut active_brush: ResMut<ActiveBrush>,
    mut active_theme: ResMut<ActiveTheme>,
    mut active_preset: ResMut<ActivePreset>,
    mut tool: ResMut<EditorTool>,
    mut history: ResMut<EditorHistory>,
    mut view_settings: ResMut<EditorViewSettings>,
    mut refresh: ResMut<RenderRefresh>,
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

    if !ui_state.style_applied {
        apply_editor_style(ctx);
        ui_state.style_applied = true;
    }
    if ui_state.path_text.is_empty()
        && let Some(path) = &path.0
    {
        ui_state.path_text = path.display().to_string();
        ui_state.screen = EditorScreen::Editor;
    }

    if ui_state.screen == EditorScreen::Home {
        home_screen(
            ctx,
            &mut ui_state,
            &mut world.world_model,
            &mut active_theme,
            &mut active_brush,
            &mut active_preset,
            &mut tool,
            &mut history,
            &mut refresh,
            &mut path,
            &mut world.world_revision,
        );
        return;
    }

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

                if tool_button(ui, *tool == EditorTool::Brush, "B", "Brush").clicked() {
                    *tool = EditorTool::Brush;
                    active_preset.0 = None;
                }
                if tool_button(ui, *tool == EditorTool::Erase, "E", "Erase").clicked() {
                    *tool = EditorTool::Erase;
                    active_preset.0 = None;
                }
                if tool_button(ui, *tool == EditorTool::Fill, "F", "Fill").clicked() {
                    *tool = EditorTool::Fill;
                    active_preset.0 = None;
                }
                if tool_button(ui, *tool == EditorTool::Pan, "P", "Pan").clicked() {
                    *tool = EditorTool::Pan;
                    active_preset.0 = None;
                }
                if tool_button(ui, *tool == EditorTool::Select, "S", "Select").clicked() {
                    *tool = EditorTool::Select;
                    active_preset.0 = None;
                }

                ui.add_space(6.0);
                ui.separator();
                ui.add_space(6.0);

                if tool_button_enabled(ui, false, "U", "Undo", history.can_undo()).clicked()
                    && history.undo(&mut world.world_model.0)
                {
                    bump_world_revision(&mut world.world_revision);
                    refresh.0 = true;
                }
                if tool_button_enabled(ui, false, "R", "Redo", history.can_redo()).clicked()
                    && history.redo(&mut world.world_model.0)
                {
                    bump_world_revision(&mut world.world_revision);
                    refresh.0 = true;
                }
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
                    SideTab::Tiles => {
                        tiles_tab(ui, &mut active_brush, &mut active_preset, &mut tool)
                    }
                    SideTab::Presets => {
                        presets_tab(ui, &mut ui_state, &mut active_preset, &mut tool)
                    }
                    SideTab::Layers => layers_tab(
                        ui,
                        &mut world.world_model,
                        &mut history,
                        &mut refresh,
                        &mut world.world_revision,
                    ),
                    SideTab::Export => export_tab(
                        ui,
                        &mut ui_state,
                        &mut world.world_model,
                        &mut active_theme,
                        &mut path,
                        &mut history,
                        &mut refresh,
                        &mut world.world_revision,
                    ),
                    SideTab::Settings => settings_tab(
                        ui,
                        &mut world.world_model,
                        &mut active_theme,
                        &mut view_settings,
                    ),
                }
            });
    }

    egui::Area::new(egui::Id::new("editor_status"))
        .anchor(egui::Align2::LEFT_TOP, egui::vec2(68.0, 12.0))
        .order(egui::Order::Foreground)
        .show(ctx, |ui| {
            floating_frame().show(ui, |ui| {
                ui.horizontal(|ui| {
                    if ui
                        .add(
                            egui::Button::new(egui::RichText::new("< Home").size(11.0))
                                .corner_radius(4),
                        )
                        .clicked()
                    {
                        ui_state.screen = EditorScreen::Home;
                    }
                    ui.separator();
                    ui.label(egui::RichText::new(&world.world_model.world_name).strong());
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
                    ui.label(format!("{:?}", *tool).to_lowercase());
                    ui.separator();
                    if let Some(index) = active_preset.0 {
                        if let Some(preset) = PRESETS.get(index) {
                            ui.label(preset.name);
                        }
                    } else {
                        ui.label(active_brush.0.id());
                    }
                });
            });
        });

    if view_settings.show_minimap {
        let (camera_projection, mut camera_position) = camera.into_inner();
        minimap_overlay(
            ctx,
            &world.world_model,
            &active_theme,
            if ui_state.side_panel_open {
                -236.0
            } else {
                -12.0
            },
            camera_projection,
            &mut camera_position,
            *window,
            world.world_revision.0,
            &mut ui_state.minimap_cache,
        );
    }

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
    tool_button_enabled(ui, selected, label, tooltip, true)
}

fn tool_button_enabled(
    ui: &mut egui::Ui,
    selected: bool,
    label: &'static str,
    tooltip: &'static str,
    enabled: bool,
) -> egui::Response {
    let button = egui::Button::new(egui::RichText::new(label).monospace().strong())
        .selected(selected)
        .min_size(egui::vec2(36.0, 36.0))
        .corner_radius(4);
    ui.add_enabled(enabled, button).on_hover_text(tooltip)
}

#[allow(clippy::too_many_arguments)]
fn home_screen(
    ctx: &egui::Context,
    ui_state: &mut EditorUiState,
    world_model: &mut ResMut<WorldModel>,
    active_theme: &mut ResMut<ActiveTheme>,
    active_brush: &mut ResMut<ActiveBrush>,
    active_preset: &mut ResMut<ActivePreset>,
    tool: &mut ResMut<EditorTool>,
    history: &mut ResMut<EditorHistory>,
    refresh: &mut ResMut<RenderRefresh>,
    path: &mut ResMut<CurrentMapPath>,
    world_revision: &mut ResMut<WorldRevision>,
) {
    egui::CentralPanel::default()
        .frame(egui::Frame::new().fill(egui::Color32::BLACK))
        .show(ctx, |ui| {
            let card_width = 520.0;
            ui.vertical_centered(|ui| {
                ui.add_space(((ui.available_height() - 580.0) * 0.5).max(12.0));
                egui::Frame::new()
                    .fill(zinc(950))
                    .stroke(egui::Stroke::new(1.0, zinc(800)))
                    .corner_radius(egui::CornerRadius::same(8))
                    .inner_margin(egui::Margin::same(24))
                    .show(ui, |ui| {
                        ui.set_width(card_width);
                        ui.vertical_centered(|ui| {
                            ui.label(
                                egui::RichText::new("GlyphWeave")
                                    .monospace()
                                    .strong()
                                    .size(26.0)
                                    .color(zinc(100)),
                            );
                            ui.label(
                                egui::RichText::new("ASCII Roguelike Tilemap Editor")
                                    .monospace()
                                    .size(13.0)
                                    .color(zinc(500)),
                            );
                        });

                        ui.add_space(22.0);
                        ui.label(
                            egui::RichText::new("World Name")
                                .size(11.0)
                                .color(zinc(400)),
                        );
                        ui.text_edit_singleline(&mut ui_state.home_world_name);

                        ui.add_space(14.0);
                        ui.label(egui::RichText::new("Tile Size").size(11.0).color(zinc(400)));
                        ui.horizontal(|ui| {
                            for size in [16, 20, 24, 32] {
                                if ui
                                    .add(
                                        egui::Button::new(format!("{size}px"))
                                            .selected(ui_state.home_tile_size == size)
                                            .min_size(egui::vec2(78.0, 28.0)),
                                    )
                                    .clicked()
                                {
                                    ui_state.home_tile_size = size;
                                }
                            }
                        });

                        ui.add_space(14.0);
                        ui.label(
                            egui::RichText::new("Color Theme")
                                .size(11.0)
                                .color(zinc(400)),
                        );
                        theme_row(
                            ui,
                            &mut ui_state.home_theme_id,
                            "ansi-16",
                            "ANSI-16",
                            "Classic terminal palette.",
                        );
                        theme_row(
                            ui,
                            &mut ui_state.home_theme_id,
                            "cogmind",
                            "Cogmind",
                            "Low-contrast sci-fi console palette.",
                        );

                        ui.add_space(18.0);
                        if ui
                            .add_enabled(
                                !ui_state.home_world_name.trim().is_empty(),
                                egui::Button::new("Create World & Enter Editor")
                                    .min_size(egui::vec2(card_width, 34.0)),
                            )
                            .clicked()
                        {
                            let mut world = World {
                                world_name: ui_state.home_world_name.trim().into(),
                                tile_size: ui_state.home_tile_size,
                                theme_id: ui_state.home_theme_id.clone(),
                                ..World::default()
                            };
                            name_first_layer_ground(&mut world);
                            enter_editor(
                                world_model,
                                ui_state,
                                active_theme,
                                active_brush,
                                active_preset,
                                tool,
                                history,
                                refresh,
                                path,
                                world_revision,
                                world,
                                None,
                            );
                            ui_state.path_text.clear();
                            ui_state.status_message.clear();
                        }

                        ui.add_space(10.0);
                        ui.horizontal(|ui| {
                            if ui
                                .add(
                                    egui::Button::new("Demo Map").min_size(egui::vec2(128.0, 32.0)),
                                )
                                .clicked()
                            {
                                let demo_path = demo_map_path();
                                match load_world(&demo_path) {
                                    Ok(world) => {
                                        ui_state.home_tile_size = world.tile_size;
                                        ui_state.home_theme_id = world.theme_id.clone();
                                        enter_editor(
                                            world_model,
                                            ui_state,
                                            active_theme,
                                            active_brush,
                                            active_preset,
                                            tool,
                                            history,
                                            refresh,
                                            path,
                                            world_revision,
                                            world,
                                            Some(demo_path.clone()),
                                        );
                                        ui_state.path_text = demo_path.display().to_string();
                                        ui_state.status_message.clear();
                                    }
                                    Err(e) => {
                                        ui_state.status_message = format!("Demo load failed: {e}");
                                    }
                                }
                            }
                            ui.text_edit_singleline(&mut ui_state.home_import_path);
                            if ui.button("Import Map").clicked() {
                                let import_path = PathBuf::from(ui_state.home_import_path.trim());
                                if import_path.as_os_str().is_empty() {
                                    ui_state.status_message = "Enter an import path first.".into();
                                } else {
                                    match load_world(&import_path) {
                                        Ok(world) => {
                                            ui_state.home_world_name = world.world_name.clone();
                                            ui_state.home_tile_size = world.tile_size;
                                            ui_state.home_theme_id = world.theme_id.clone();
                                            enter_editor(
                                                world_model,
                                                ui_state,
                                                active_theme,
                                                active_brush,
                                                active_preset,
                                                tool,
                                                history,
                                                refresh,
                                                path,
                                                world_revision,
                                                world,
                                                Some(import_path.clone()),
                                            );
                                            ui_state.path_text = import_path.display().to_string();
                                            ui_state.status_message.clear();
                                        }
                                        Err(e) => {
                                            ui_state.status_message = format!("Import failed: {e}");
                                        }
                                    }
                                }
                            }
                        });

                        if !ui_state.status_message.is_empty() {
                            ui.add_space(10.0);
                            ui.label(
                                egui::RichText::new(&ui_state.status_message)
                                    .size(11.0)
                                    .color(zinc(400)),
                            );
                        }
                    });
            });
        });
}

fn theme_row(
    ui: &mut egui::Ui,
    theme_id: &mut String,
    id: &'static str,
    name: &'static str,
    description: &'static str,
) {
    ui.horizontal(|ui| {
        for kind in [
            TileKind::Wall,
            TileKind::Floor,
            TileKind::Door,
            TileKind::Water,
            TileKind::Tree,
            TileKind::Lava,
        ] {
            let (rect, _) = ui.allocate_exact_size(egui::vec2(20.0, 20.0), egui::Sense::hover());
            ui.painter().rect_filled(rect, 3.0, tile_bg(kind, id));
            ui.painter().text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                kind.glyph(),
                egui::FontId::monospace(10.0),
                tile_fg(kind, id),
            );
        }
        let selected = theme_id == id;
        if ui
            .add(
                egui::Button::new(format!("{name} - {description}"))
                    .selected(selected)
                    .min_size(egui::vec2(330.0, 28.0)),
            )
            .clicked()
        {
            *theme_id = id.into();
        }
    });
}

#[allow(clippy::too_many_arguments)]
fn enter_editor(
    world_model: &mut ResMut<WorldModel>,
    ui_state: &mut EditorUiState,
    active_theme: &mut ResMut<ActiveTheme>,
    active_brush: &mut ResMut<ActiveBrush>,
    active_preset: &mut ResMut<ActivePreset>,
    tool: &mut ResMut<EditorTool>,
    history: &mut ResMut<EditorHistory>,
    refresh: &mut ResMut<RenderRefresh>,
    path: &mut ResMut<CurrentMapPath>,
    world_revision: &mut ResMut<WorldRevision>,
    world: World,
    current_path: Option<PathBuf>,
) {
    let theme_id = world.theme_id.clone();
    world_model.0 = world;
    active_theme.0 = theme_id;
    active_brush.0 = TileKind::Wall;
    active_preset.0 = None;
    **tool = EditorTool::Brush;
    ui_state.screen = EditorScreen::Editor;
    ui_state.minimap_cache = MinimapCache::default();
    **history = EditorHistory::default();
    path.0 = current_path;
    bump_world_revision(world_revision);
    refresh.0 = true;
}

fn demo_map_path() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop();
    path.pop();
    path.pop();
    path.push("examples");
    path.push("aethra-mega.gemap");
    path
}

fn empty_ground_world() -> World {
    let mut world = World::default();
    name_first_layer_ground(&mut world);
    world
}

fn name_first_layer_ground(world: &mut World) {
    if let Some(layer) = world.layers.first_mut() {
        layer.name = "Ground".into();
    }
}

fn bump_world_revision(world_revision: &mut ResMut<WorldRevision>) {
    world_revision.0 = world_revision.0.wrapping_add(1);
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

fn tiles_tab(
    ui: &mut egui::Ui,
    active_brush: &mut ResMut<ActiveBrush>,
    active_preset: &mut ResMut<ActivePreset>,
    tool: &mut ResMut<EditorTool>,
) {
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
                        active_preset.0 = None;
                        **tool = EditorTool::Brush;
                    }
                }
            });
            ui.add_space(8.0);
        }
    });
}

fn presets_tab(
    ui: &mut egui::Ui,
    ui_state: &mut EditorUiState,
    active_preset: &mut ResMut<ActivePreset>,
    tool: &mut ResMut<EditorTool>,
) {
    ui.heading("Presets");
    ui.add_space(2.0);
    ui.horizontal_wrapped(|ui| {
        for category in PresetCategory::ALL {
            if ui
                .add(
                    egui::Button::new(egui::RichText::new(category.label()).size(11.0))
                        .selected(ui_state.preset_category == category)
                        .corner_radius(3),
                )
                .clicked()
            {
                ui_state.preset_category = category;
            }
        }
    });
    ui.separator();

    egui::ScrollArea::vertical().show(ui, |ui| {
        for (index, preset) in PRESETS.iter().enumerate() {
            if preset.category != ui_state.preset_category {
                continue;
            }
            let selected = active_preset.0 == Some(index);
            egui::Frame::new()
                .fill(if selected { zinc(800) } else { zinc(900) })
                .stroke(egui::Stroke::new(
                    1.0,
                    if selected { zinc(400) } else { zinc(800) },
                ))
                .corner_radius(egui::CornerRadius::same(5))
                .inner_margin(egui::Margin::symmetric(6, 6))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        preset_preview(ui, preset.grid, 8.0);
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new(preset.name).size(12.0).strong());
                            ui.label(
                                egui::RichText::new(preset.description)
                                    .size(10.0)
                                    .color(zinc(500)),
                            );
                        });
                    });
                    let response = ui
                        .add(
                            egui::Button::new(if selected { "Selected" } else { "Place" })
                                .selected(selected)
                                .corner_radius(3),
                        )
                        .on_hover_text(preset.id);
                    if response.clicked() {
                        active_preset.0 = Some(index);
                        **tool = EditorTool::Brush;
                    }
                });
            ui.add_space(6.0);
        }
    });
}

fn layers_tab(
    ui: &mut egui::Ui,
    world_model: &mut ResMut<WorldModel>,
    history: &mut ResMut<EditorHistory>,
    refresh: &mut ResMut<RenderRefresh>,
    world_revision: &mut ResMut<WorldRevision>,
) {
    ui.heading("Layers");
    ui.add_space(2.0);

    if ui.button("+ Add Layer").clicked() {
        history.push_snapshot(&world_model.0);
        let next = next_layer_id(&world_model.0);
        let name = format!("Layer {}", world_model.layers.len());
        world_model.layers.push(Layer::new(next.clone(), name));
        world_model.ensure_grid(&next);
        bump_world_revision(world_revision);
        refresh.0 = true;
    }
    ui.add_space(4.0);

    let active = world_model.active_layer.clone();
    let mut rows: Vec<(usize, String, String, bool, bool, bool)> = world_model
        .layers
        .iter()
        .enumerate()
        .map(|(i, l)| (i, l.id.clone(), l.name.clone(), l.visible, l.locked, false))
        .collect();
    let mut new_active: Option<String> = None;

    let can_remove = rows.len() > 1;
    for (_, id, name, vis, lock, remove) in &mut rows {
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
                        egui::Button::new(name.as_str())
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
                    if can_remove && ui.button("Delete").clicked() {
                        *remove = true;
                    }
                });
            });
    }

    let remove_index = rows
        .iter()
        .find_map(|(index, _, _, _, _, remove)| remove.then_some(*index));
    if let Some(index) = remove_index {
        history.push_snapshot(&world_model.0);
        if let Some(layer) = world_model.layers.get(index).cloned() {
            world_model.layers.remove(index);
            world_model.grids.remove(&layer.id);
            if world_model.active_layer == layer.id {
                world_model.active_layer = world_model
                    .layers
                    .get(index.saturating_sub(1))
                    .or_else(|| world_model.layers.first())
                    .map(|l| l.id.clone())
                    .unwrap_or_else(|| "layer-1".into());
            }
            bump_world_revision(world_revision);
            refresh.0 = true;
        }
        return;
    }

    let mut layer_state_changed = false;
    for (i, _, _, vis, lock, _) in rows {
        if let Some(layer) = world_model.layers.get_mut(i)
            && (layer.visible != vis || layer.locked != lock)
        {
            layer.visible = vis;
            layer.locked = lock;
            layer_state_changed = true;
        }
    }
    if layer_state_changed {
        bump_world_revision(world_revision);
        refresh.0 = true;
    }
    if let Some(active_layer) = new_active {
        world_model.active_layer = active_layer;
    }
}

#[allow(clippy::too_many_arguments)]
fn export_tab(
    ui: &mut egui::Ui,
    ui_state: &mut EditorUiState,
    world_model: &mut ResMut<WorldModel>,
    active_theme: &mut ResMut<ActiveTheme>,
    path: &mut ResMut<CurrentMapPath>,
    history: &mut ResMut<EditorHistory>,
    refresh: &mut ResMut<RenderRefresh>,
    world_revision: &mut ResMut<WorldRevision>,
) {
    ui.heading("Export / Import");
    ui.add_space(8.0);

    ui.label(egui::RichText::new("Path").size(11.0).color(zinc(500)));
    ui.text_edit_singleline(&mut ui_state.path_text);

    if let Some(current) = &path.0 {
        ui.label(
            egui::RichText::new(format!("Current: {}", current.display()))
                .size(10.0)
                .color(zinc(500)),
        );
    }

    ui.horizontal_wrapped(|ui| {
        if ui.button("Save Current").clicked() {
            let target = path
                .0
                .clone()
                .unwrap_or_else(|| PathBuf::from("glyphweave_save.gemap"));
            save_to_path(&world_model.0, &target, &mut ui_state.status_message);
        }
        if ui.button("Export Path").clicked() {
            let target = PathBuf::from(ui_state.path_text.trim());
            if target.as_os_str().is_empty() {
                ui_state.status_message = "Enter an export path first.".into();
            } else {
                save_to_path(&world_model.0, &target, &mut ui_state.status_message);
                path.0 = Some(target);
            }
        }
        if ui.button("Import Path").clicked() {
            let target = PathBuf::from(ui_state.path_text.trim());
            if target.as_os_str().is_empty() {
                ui_state.status_message = "Enter an import path first.".into();
            } else {
                match load_world(&target) {
                    Ok(world) => {
                        history.push_snapshot(&world_model.0);
                        world_model.0 = world;
                        active_theme.0 = world_model.theme_id.clone();
                        path.0 = Some(target);
                        bump_world_revision(world_revision);
                        refresh.0 = true;
                        ui_state.status_message = "Imported map.".into();
                    }
                    Err(e) => {
                        ui_state.status_message = format!("Import failed: {e}");
                    }
                }
            }
        }
        if ui.button("New Empty").clicked() {
            history.push_snapshot(&world_model.0);
            world_model.0 = empty_ground_world();
            active_theme.0 = world_model.theme_id.clone();
            path.0 = None;
            bump_world_revision(world_revision);
            refresh.0 = true;
            ui_state.status_message = "Created a new empty world.".into();
        }
    });

    ui.add_space(8.0);
    ui.label(
        egui::RichText::new("Native file pickers are not wired yet; use a full path.")
            .size(10.0)
            .color(zinc(500)),
    );
    if !ui_state.status_message.is_empty() {
        ui.add_space(8.0);
        ui.label(egui::RichText::new(&ui_state.status_message).size(11.0));
    }
}

fn settings_tab(
    ui: &mut egui::Ui,
    world_model: &mut ResMut<WorldModel>,
    active_theme: &mut ResMut<ActiveTheme>,
    view_settings: &mut ResMut<EditorViewSettings>,
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
    ui.label(egui::RichText::new("View").size(11.0).color(zinc(500)));
    ui.horizontal(|ui| {
        ui.label("View Distance");
        ui.add(egui::DragValue::new(&mut view_settings.view_distance).range(1..=50));
    });
    ui.checkbox(&mut view_settings.show_grid, "Show Grid");
    ui.checkbox(&mut view_settings.show_minimap, "Show Minimap");
}

fn preset_preview(ui: &mut egui::Ui, grid: &[&[TileKind]], cell: f32) {
    let rows = grid.len();
    let cols = grid.iter().map(|row| row.len()).max().unwrap_or(1);
    let (rect, _) = ui.allocate_exact_size(
        egui::vec2(cols as f32 * cell, rows as f32 * cell),
        egui::Sense::hover(),
    );
    let painter = ui.painter_at(rect);

    for (y, row) in grid.iter().enumerate() {
        for (x, kind) in row.iter().enumerate() {
            if matches!(kind, TileKind::Void) {
                continue;
            }
            let cell_rect = egui::Rect::from_min_size(
                rect.min + egui::vec2(x as f32 * cell, y as f32 * cell),
                egui::vec2(cell, cell),
            );
            painter.rect_filled(cell_rect, 0.0, tile_bg(*kind, "ansi-16"));
            painter.text(
                cell_rect.center(),
                egui::Align2::CENTER_CENTER,
                kind.glyph(),
                egui::FontId::monospace((cell * 0.8).max(6.0)),
                tile_fg(*kind, "ansi-16"),
            );
        }
    }
}

const MINIMAP_WIDTH: usize = 200;
const MINIMAP_HEIGHT: usize = 140;

#[derive(Clone, Copy)]
struct MinimapProjection {
    min_x: i32,
    min_y: i32,
    draw_w: f32,
    draw_h: f32,
    offset_x: f32,
    offset_y: f32,
    scale: f32,
}

#[allow(clippy::too_many_arguments)]
fn minimap_overlay(
    ctx: &egui::Context,
    world_model: &WorldModel,
    active_theme: &ActiveTheme,
    x_offset: f32,
    camera_projection: &Projection,
    camera_position: &mut Transform,
    window: &Window,
    world_revision: u64,
    minimap_cache: &mut MinimapCache,
) {
    egui::Area::new(egui::Id::new("editor_minimap"))
        .anchor(egui::Align2::RIGHT_TOP, egui::vec2(x_offset, 12.0))
        .order(egui::Order::Foreground)
        .show(ctx, |ui| {
            floating_frame().show(ui, |ui| {
                let size = egui::vec2(MINIMAP_WIDTH as f32, MINIMAP_HEIGHT as f32);
                let (rect, response) = ui.allocate_exact_size(size, egui::Sense::click());
                let response = response.on_hover_text(&world_model.world_name);
                let painter = ui.painter_at(rect);
                painter.rect_filled(rect, 0.0, egui::Color32::BLACK);

                let signature = MinimapSignature {
                    world_revision,
                    theme_id: active_theme.0.clone(),
                };

                let cache_stale = minimap_cache.texture.is_none()
                    || minimap_cache.signature.as_ref() != Some(&signature);
                if cache_stale {
                    let Some(projection) = minimap_projection(&world_model.0) else {
                        minimap_cache.texture = None;
                        minimap_cache.projection = None;
                        minimap_cache.signature = Some(signature);
                        return;
                    };
                    let image = minimap_image(&world_model.0, &active_theme.0, projection);
                    if let Some(texture) = minimap_cache.texture.as_mut() {
                        texture.set(image, egui::TextureOptions::NEAREST);
                    } else {
                        minimap_cache.texture = Some(ctx.load_texture(
                            "glyphweave_minimap",
                            image,
                            egui::TextureOptions::NEAREST,
                        ));
                    }
                    minimap_cache.projection = Some(projection);
                    minimap_cache.signature = Some(signature);
                }
                let Some(texture) = minimap_cache.texture.as_ref() else {
                    return;
                };
                let Some(projection) = minimap_cache.projection else {
                    return;
                };

                painter.image(
                    texture.id(),
                    rect,
                    egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
                    egui::Color32::WHITE,
                );

                let origin = rect.min + egui::vec2(projection.offset_x, projection.offset_y);
                painter.rect_stroke(
                    egui::Rect::from_min_size(
                        origin,
                        egui::vec2(projection.draw_w, projection.draw_h),
                    ),
                    0.0,
                    egui::Stroke::new(1.0, zinc(500)),
                    egui::StrokeKind::Inside,
                );
                draw_minimap_viewport(
                    &painter,
                    rect,
                    origin,
                    projection.scale,
                    projection.min_x,
                    projection.min_y,
                    camera_position,
                    camera_projection,
                    window,
                    world_model.tile_size,
                );

                if response.clicked() {
                    let Some(pointer) = response.interact_pointer_pos() else {
                        return;
                    };
                    let local = pointer - origin;
                    if local.x < 0.0
                        || local.y < 0.0
                        || local.x > projection.draw_w
                        || local.y > projection.draw_h
                    {
                        return;
                    }
                    let tile_x = projection.min_x as f32 + local.x / projection.scale;
                    let tile_y = projection.min_y as f32 + local.y / projection.scale;
                    let tile_px = world_model.tile_size.max(1) as f32;
                    camera_position.translation.x = (tile_x + 0.5) * tile_px;
                    camera_position.translation.y = -(tile_y + 0.5) * tile_px;
                }
            });
        });
}

fn minimap_projection(world: &World) -> Option<MinimapProjection> {
    let (min_x, min_y, max_x, max_y) = visible_tile_bounds(world)?;
    let width = (max_x - min_x + 1).max(1) as f32;
    let height = (max_y - min_y + 1).max(1) as f32;
    let scale = (MINIMAP_WIDTH as f32 / width).min(MINIMAP_HEIGHT as f32 / height);
    let draw_w = width * scale;
    let draw_h = height * scale;
    Some(MinimapProjection {
        min_x,
        min_y,
        draw_w,
        draw_h,
        offset_x: (MINIMAP_WIDTH as f32 - draw_w) * 0.5,
        offset_y: (MINIMAP_HEIGHT as f32 - draw_h) * 0.5,
        scale,
    })
}

fn minimap_image(world: &World, theme_id: &str, projection: MinimapProjection) -> egui::ColorImage {
    let mut image = egui::ColorImage::filled([MINIMAP_WIDTH, MINIMAP_HEIGHT], egui::Color32::BLACK);

    for layer in &world.layers {
        if !layer.visible {
            continue;
        }
        let Some(grid) = world.grid(&layer.id) else {
            continue;
        };
        for ((x, y), kind) in grid.iter_tiles() {
            if matches!(kind, TileKind::Void) {
                continue;
            }
            fill_minimap_tile(&mut image, projection, x, y, tile_bg(kind, theme_id));
        }
    }

    image
}

fn fill_minimap_tile(
    image: &mut egui::ColorImage,
    projection: MinimapProjection,
    x: i32,
    y: i32,
    color: egui::Color32,
) {
    let x0 = (projection.offset_x + (x - projection.min_x) as f32 * projection.scale)
        .floor()
        .clamp(0.0, MINIMAP_WIDTH as f32) as usize;
    let y0 = (projection.offset_y + (y - projection.min_y) as f32 * projection.scale)
        .floor()
        .clamp(0.0, MINIMAP_HEIGHT as f32) as usize;
    let x1 = (projection.offset_x + (x - projection.min_x + 1) as f32 * projection.scale)
        .ceil()
        .clamp(0.0, MINIMAP_WIDTH as f32) as usize;
    let y1 = (projection.offset_y + (y - projection.min_y + 1) as f32 * projection.scale)
        .ceil()
        .clamp(0.0, MINIMAP_HEIGHT as f32) as usize;

    if x0 >= x1 || y0 >= y1 {
        return;
    }

    for py in y0..y1 {
        let row = py * MINIMAP_WIDTH;
        for px in x0..x1 {
            image.pixels[row + px] = color;
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn draw_minimap_viewport(
    painter: &egui::Painter,
    minimap_rect: egui::Rect,
    origin: egui::Pos2,
    scale: f32,
    min_x: i32,
    min_y: i32,
    camera_transform: &Transform,
    camera_projection: &Projection,
    window: &Window,
    tile_size: u32,
) {
    let Some(view_bounds) =
        world_viewport_bounds_current(camera_transform, camera_projection, window)
    else {
        return;
    };

    let tile_px = tile_size.max(1) as f32;
    let view_left = view_bounds.min_x / tile_px;
    let view_top = -view_bounds.max_y / tile_px;
    let view_width = (view_bounds.max_x - view_bounds.min_x) / tile_px;
    let view_height = (view_bounds.max_y - view_bounds.min_y) / tile_px;
    let viewport_rect = egui::Rect::from_min_size(
        origin
            + egui::vec2(
                (view_left - min_x as f32) * scale,
                (view_top - min_y as f32) * scale,
            ),
        egui::vec2(view_width * scale, view_height * scale),
    );
    let clipped = viewport_rect.intersect(minimap_rect);
    let dim = egui::Color32::from_rgba_premultiplied(0, 0, 0, 115);

    fill_positive_rect(
        painter,
        egui::Rect::from_min_max(
            minimap_rect.min,
            egui::pos2(minimap_rect.max.x, clipped.min.y),
        ),
        dim,
    );
    fill_positive_rect(
        painter,
        egui::Rect::from_min_max(
            egui::pos2(minimap_rect.min.x, clipped.max.y),
            minimap_rect.max,
        ),
        dim,
    );
    fill_positive_rect(
        painter,
        egui::Rect::from_min_max(
            egui::pos2(minimap_rect.min.x, clipped.min.y),
            egui::pos2(clipped.min.x, clipped.max.y),
        ),
        dim,
    );
    fill_positive_rect(
        painter,
        egui::Rect::from_min_max(
            egui::pos2(clipped.max.x, clipped.min.y),
            egui::pos2(minimap_rect.max.x, clipped.max.y),
        ),
        dim,
    );

    painter.rect_stroke(
        viewport_rect,
        0.0,
        egui::Stroke::new(1.5, egui::Color32::WHITE),
        egui::StrokeKind::Inside,
    );
}

fn fill_positive_rect(painter: &egui::Painter, rect: egui::Rect, color: egui::Color32) {
    if rect.min.x < rect.max.x && rect.min.y < rect.max.y {
        painter.rect_filled(rect, 0.0, color);
    }
}

fn visible_tile_bounds(world: &World) -> Option<(i32, i32, i32, i32)> {
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;
    let mut any = false;

    for layer in &world.layers {
        if !layer.visible {
            continue;
        }
        let Some(grid) = world.grid(&layer.id) else {
            continue;
        };
        for ((x, y), _) in grid.iter_tiles() {
            any = true;
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
    }

    any.then_some((min_x, min_y, max_x, max_y))
}

fn save_to_path(world: &World, target: &Path, status: &mut String) {
    match save_world(world, target) {
        Ok(()) => {
            println!("[glyphweave] saved {}", target.display());
            *status = format!("Saved {}", target.display());
        }
        Err(e) => {
            eprintln!("[glyphweave] save failed: {e}");
            *status = format!("Save failed: {e}");
        }
    }
}

fn next_layer_id(world: &World) -> String {
    let next = world
        .layers
        .iter()
        .filter_map(|layer| layer.id.strip_prefix("layer-"))
        .filter_map(|suffix| suffix.parse::<usize>().ok())
        .max()
        .unwrap_or(0)
        + 1;
    format!("layer-{next}")
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

fn rgb(hex: u32) -> egui::Color32 {
    egui::Color32::from_rgb(
        ((hex >> 16) & 0xff) as u8,
        ((hex >> 8) & 0xff) as u8,
        (hex & 0xff) as u8,
    )
}

fn tile_fg(kind: TileKind, theme_id: &str) -> egui::Color32 {
    if theme_id == "cogmind" {
        match kind {
            TileKind::Void => rgb(0x000000),
            TileKind::Wall => rgb(0x708090),
            TileKind::Floor => rgb(0x404050),
            TileKind::FloorAlt => rgb(0x353545),
            TileKind::Door => rgb(0xdaa520),
            TileKind::DoorOpen => rgb(0xb8960e),
            TileKind::Water => rgb(0x4488cc),
            TileKind::DeepWater => rgb(0x3366aa),
            TileKind::Lava => rgb(0xff4400),
            TileKind::Tree => rgb(0x33aa55),
            TileKind::Grass => rgb(0x227744),
            TileKind::Bridge => rgb(0x6b5b45),
            TileKind::StairsDown | TileKind::StairsUp => rgb(0x88ccff),
            TileKind::Altar => rgb(0xcc66cc),
            TileKind::Fountain => rgb(0x66cccc),
            TileKind::Grave => rgb(0x556655),
            TileKind::Trap => rgb(0xcc4444),
            TileKind::Pillar => rgb(0x606070),
            TileKind::Treasure => rgb(0xddbb33),
            TileKind::Shop => rgb(0xccaa44),
            TileKind::Table => rgb(0x6b3a1a),
            TileKind::Throne => rgb(0xccaa00),
            TileKind::Cage => rgb(0x8888aa),
            TileKind::Blood => rgb(0x882222),
            TileKind::Bar => rgb(0x6b5b45),
        }
    } else {
        match kind {
            TileKind::Void => rgb(0x000000),
            TileKind::Wall => rgb(0xa0a0a0),
            TileKind::Floor => rgb(0x808080),
            TileKind::FloorAlt => rgb(0x606060),
            TileKind::Door => rgb(0xffff00),
            TileKind::DoorOpen => rgb(0xc0c000),
            TileKind::Water => rgb(0x0000ff),
            TileKind::DeepWater => rgb(0x0000aa),
            TileKind::Lava => rgb(0xff5500),
            TileKind::Tree => rgb(0x00ff00),
            TileKind::Grass => rgb(0x00aa00),
            TileKind::Bridge => rgb(0x8b7355),
            TileKind::StairsDown | TileKind::StairsUp => rgb(0xffffff),
            TileKind::Altar => rgb(0xff00ff),
            TileKind::Fountain => rgb(0x00ffff),
            TileKind::Grave => rgb(0x808080),
            TileKind::Trap => rgb(0xff0000),
            TileKind::Pillar => rgb(0xa0a0a0),
            TileKind::Treasure => rgb(0xffff00),
            TileKind::Shop => rgb(0xffff55),
            TileKind::Table => rgb(0x8b4513),
            TileKind::Throne => rgb(0xffd700),
            TileKind::Cage => rgb(0xc0c0c0),
            TileKind::Blood => rgb(0xaa0000),
            TileKind::Bar => rgb(0x8b7355),
        }
    }
}

fn tile_bg(kind: TileKind, theme_id: &str) -> egui::Color32 {
    if theme_id == "cogmind" {
        match kind {
            TileKind::Void => rgb(0x000000),
            TileKind::Wall => rgb(0x0a0a0a),
            TileKind::Floor => rgb(0x121216),
            TileKind::FloorAlt => rgb(0x0e0e12),
            TileKind::Door => rgb(0x141408),
            TileKind::DoorOpen => rgb(0x101006),
            TileKind::Water => rgb(0x06061a),
            TileKind::DeepWater => rgb(0x040410),
            TileKind::Lava => rgb(0x1a0600),
            TileKind::Tree => rgb(0x0a140a),
            TileKind::Grass => rgb(0x060e06),
            TileKind::Bridge => rgb(0x141008),
            TileKind::StairsDown | TileKind::StairsUp => rgb(0x0a1420),
            TileKind::Altar => rgb(0x140a14),
            TileKind::Fountain => rgb(0x0a1414),
            TileKind::Grave => rgb(0x080808),
            TileKind::Trap => rgb(0x140808),
            TileKind::Pillar => rgb(0x060606),
            TileKind::Treasure => rgb(0x141006),
            TileKind::Shop => rgb(0x141008),
            TileKind::Table => rgb(0x140800),
            TileKind::Throne => rgb(0x141000),
            TileKind::Cage => rgb(0x040408),
            TileKind::Blood => rgb(0x080000),
            TileKind::Bar => rgb(0x000000),
        }
    } else {
        match kind {
            TileKind::Void => rgb(0x000000),
            TileKind::Wall => rgb(0x000000),
            TileKind::Floor => rgb(0x1a1a1a),
            TileKind::FloorAlt => rgb(0x151515),
            TileKind::Door => rgb(0x1a1a00),
            TileKind::DoorOpen => rgb(0x151500),
            TileKind::Water => rgb(0x00001a),
            TileKind::DeepWater => rgb(0x00000a),
            TileKind::Lava => rgb(0x1a0500),
            TileKind::Tree => rgb(0x001a00),
            TileKind::Grass => rgb(0x000a00),
            TileKind::Bridge => rgb(0x1a1410),
            TileKind::StairsDown | TileKind::StairsUp => rgb(0x1a1a1a),
            TileKind::Altar => rgb(0x1a001a),
            TileKind::Fountain => rgb(0x001a1a),
            TileKind::Grave => rgb(0x0a0a0a),
            TileKind::Trap => rgb(0x1a0000),
            TileKind::Pillar => rgb(0x050505),
            TileKind::Treasure => rgb(0x1a1a00),
            TileKind::Shop => rgb(0x1a1a0a),
            TileKind::Table => rgb(0x1a0a00),
            TileKind::Throne => rgb(0x1a1400),
            TileKind::Cage => rgb(0x050505),
            TileKind::Blood => rgb(0x0a0000),
            TileKind::Bar => rgb(0x000000),
        }
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
const TERRAIN_TILES: [TileKind; 1] = [TileKind::Lava];
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
