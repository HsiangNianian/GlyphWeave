//! Tool system: left-drag paints, B selects brush, E selects erase.
//! Produces EditEvents + applies edits to the core World (single source of truth).
use crate::ActiveBrush;
use crate::preset::PRESETS;
use crate::render::MapBounds;
use crate::render::tilemap::RenderRefresh;
use crate::resource::{
    ActivePreset, CursorTile, EditEvent, EditorHistory, EditorTool, EditorViewSettings, WorldModel,
    WorldRevision,
};
use bevy::ecs::message::MessageWriter;
use bevy::prelude::*;
use glyphweave_core::edit::Edit;
use glyphweave_core::tile::TileKind;
use std::collections::{HashSet, VecDeque};

#[allow(clippy::too_many_arguments)]
pub fn tool_system(
    buttons: Res<ButtonInput<MouseButton>>,
    keys: Res<ButtonInput<KeyCode>>,
    mut writer: MessageWriter<EditEvent>,
    mut world: ResMut<WorldModel>,
    mut world_revision: ResMut<WorldRevision>,
    mut history: ResMut<EditorHistory>,
    mut refresh: ResMut<RenderRefresh>,
    mut tool: ResMut<EditorTool>,
    mut view_settings: ResMut<EditorViewSettings>,
    active_brush: Res<ActiveBrush>,
    active_preset: Res<ActivePreset>,
    cursor: Res<CursorTile>,
    bounds: Option<Res<MapBounds>>,
) {
    let modifier = keys.pressed(KeyCode::ControlLeft)
        || keys.pressed(KeyCode::ControlRight)
        || keys.pressed(KeyCode::SuperLeft)
        || keys.pressed(KeyCode::SuperRight);
    let shift = keys.pressed(KeyCode::ShiftLeft) || keys.pressed(KeyCode::ShiftRight);
    if modifier && keys.just_pressed(KeyCode::KeyZ) {
        let changed = if shift {
            history.redo(&mut world.0)
        } else {
            history.undo(&mut world.0)
        };
        if changed {
            bump_world_revision(&mut world_revision);
            refresh.0 = true;
        }
        return;
    }

    if keys.just_pressed(KeyCode::KeyB) {
        *tool = EditorTool::Brush;
    }
    if keys.just_pressed(KeyCode::KeyE) {
        *tool = EditorTool::Erase;
    }
    if keys.just_pressed(KeyCode::KeyF) {
        *tool = EditorTool::Fill;
    }
    if keys.just_pressed(KeyCode::KeyP) {
        *tool = EditorTool::Pan;
    }
    if keys.just_pressed(KeyCode::KeyS) {
        *tool = EditorTool::Select;
    }
    if keys.just_pressed(KeyCode::KeyG) {
        view_settings.show_grid = !view_settings.show_grid;
    }

    if !buttons.pressed(MouseButton::Left) || !cursor.valid {
        return;
    }
    if matches!(*tool, EditorTool::Pan | EditorTool::Select) {
        return;
    }

    // Honor the locked flag on the active layer.
    let active_locked = world
        .layer(&world.active_layer)
        .map(|l| l.locked)
        .unwrap_or(false);
    if active_locked {
        return;
    }

    if buttons.just_pressed(MouseButton::Left) {
        history.push_snapshot(&world.0);
    }

    let active_layer = world.active_layer.clone();
    if buttons.just_pressed(MouseButton::Left) {
        if let Some(preset_index) = active_preset.0
            && let Some(preset) = PRESETS.get(preset_index)
        {
            for (dy, row) in preset.grid.iter().enumerate() {
                for (dx, kind) in row.iter().enumerate() {
                    if !matches!(kind, TileKind::Void) {
                        world.set(
                            &active_layer,
                            cursor.x + dx as i32,
                            cursor.y + dy as i32,
                            *kind,
                        );
                    }
                }
            }
            refresh_for_expanded_bounds(&mut refresh, bounds.as_deref(), cursor.x, cursor.y);
            bump_world_revision(&mut world_revision);
            refresh.0 = true;
            return;
        }

        if matches!(*tool, EditorTool::Fill) {
            if flood_fill(
                &mut world.0,
                &active_layer,
                cursor.x,
                cursor.y,
                active_brush.0,
            ) {
                bump_world_revision(&mut world_revision);
                refresh.0 = true;
            }
            return;
        }
    }

    let edit = if matches!(*tool, EditorTool::Erase) || matches!(active_brush.0, TileKind::Void) {
        Edit::Erase
    } else {
        Edit::Set(active_brush.0)
    };

    edit.apply(&mut world.0, &active_layer, cursor.x, cursor.y);
    bump_world_revision(&mut world_revision);
    refresh_for_expanded_bounds(&mut refresh, bounds.as_deref(), cursor.x, cursor.y);
    writer.write(EditEvent {
        x: cursor.x,
        y: cursor.y,
    });
}

fn bump_world_revision(world_revision: &mut ResMut<WorldRevision>) {
    world_revision.0 = world_revision.0.wrapping_add(1);
}

fn flood_fill(
    world: &mut glyphweave_core::world::World,
    layer_id: &str,
    start_x: i32,
    start_y: i32,
    fill: TileKind,
) -> bool {
    let Some(target) = world.get(layer_id, start_x, start_y) else {
        return false;
    };
    if target == fill {
        return false;
    }

    let mut visited: HashSet<(i32, i32)> = HashSet::new();
    let mut queue: VecDeque<(i32, i32)> = VecDeque::from([(start_x, start_y)]);
    let mut changed = false;

    while let Some((x, y)) = queue.pop_front() {
        if !visited.insert((x, y)) {
            continue;
        }
        if world.get(layer_id, x, y) != Some(target) {
            continue;
        }

        world.set(layer_id, x, y, fill);
        changed = true;

        queue.push_back((x - 1, y));
        queue.push_back((x + 1, y));
        queue.push_back((x, y - 1));
        queue.push_back((x, y + 1));
    }

    changed
}

fn refresh_for_expanded_bounds(
    refresh: &mut RenderRefresh,
    bounds: Option<&MapBounds>,
    x: i32,
    y: i32,
) {
    let Some(bounds) = bounds else {
        refresh.0 = true;
        return;
    };
    let max_x = bounds.min_x + bounds.width as i32;
    let max_y = bounds.min_y + bounds.height as i32;
    if x < bounds.min_x || y < bounds.min_y || x >= max_x || y >= max_y {
        refresh.0 = true;
    }
}
