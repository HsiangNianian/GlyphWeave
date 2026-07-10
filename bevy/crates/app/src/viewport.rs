//! Current-frame 2D orthographic camera viewport math.
//!
//! Bevy's `Camera::viewport_to_world_2d` uses cached camera matrices that are
//! updated after transform propagation. Editor interaction systems mutate the
//! camera earlier in the frame, so they need math based on the live
//! `Transform` and `Projection` components instead.
use bevy::camera::ScalingMode;
use bevy::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WorldViewportBounds {
    pub min_x: f32,
    pub max_x: f32,
    pub min_y: f32,
    pub max_y: f32,
}

pub fn viewport_to_world_2d_current(
    transform: &Transform,
    projection: &Projection,
    window: &Window,
    viewport_position: Vec2,
) -> Option<Vec2> {
    viewport_to_world_2d_for_size(
        transform,
        projection,
        Vec2::new(window.width(), window.height()),
        viewport_position,
    )
}

pub fn world_viewport_bounds_current(
    transform: &Transform,
    projection: &Projection,
    window: &Window,
) -> Option<WorldViewportBounds> {
    world_viewport_bounds_for_size(
        transform,
        projection,
        Vec2::new(window.width(), window.height()),
    )
}

fn viewport_to_world_2d_for_size(
    transform: &Transform,
    projection: &Projection,
    viewport_size: Vec2,
    viewport_position: Vec2,
) -> Option<Vec2> {
    let area = orthographic_area_for_size(projection, viewport_size)?;
    if viewport_size.x <= 0.0 || viewport_size.y <= 0.0 {
        return None;
    }

    let x_t = viewport_position.x / viewport_size.x;
    let y_t = viewport_position.y / viewport_size.y;
    let local_x = area.min.x + area.width() * x_t;
    let local_y = area.max.y - area.height() * y_t;
    Some(
        transform
            .to_matrix()
            .transform_point3(Vec3::new(local_x, local_y, 0.0))
            .truncate(),
    )
}

fn world_viewport_bounds_for_size(
    transform: &Transform,
    projection: &Projection,
    viewport_size: Vec2,
) -> Option<WorldViewportBounds> {
    let top_left = viewport_to_world_2d_for_size(transform, projection, viewport_size, Vec2::ZERO)?;
    let bottom_right =
        viewport_to_world_2d_for_size(transform, projection, viewport_size, viewport_size)?;
    Some(WorldViewportBounds {
        min_x: top_left.x.min(bottom_right.x),
        max_x: top_left.x.max(bottom_right.x),
        min_y: top_left.y.min(bottom_right.y),
        max_y: top_left.y.max(bottom_right.y),
    })
}

fn orthographic_area_for_size(projection: &Projection, viewport_size: Vec2) -> Option<Rect> {
    let Projection::Orthographic(ortho) = projection else {
        return None;
    };
    if viewport_size.x <= 0.0 || viewport_size.y <= 0.0 {
        return None;
    }

    let projection_size = projection_size_for_viewport(ortho, viewport_size)?;
    let origin = projection_size * ortho.viewport_origin;
    Some(Rect::new(
        ortho.scale * -origin.x,
        ortho.scale * -origin.y,
        ortho.scale * (projection_size.x - origin.x),
        ortho.scale * (projection_size.y - origin.y),
    ))
}

fn projection_size_for_viewport(
    ortho: &OrthographicProjection,
    viewport_size: Vec2,
) -> Option<Vec2> {
    let width = viewport_size.x;
    let height = viewport_size.y;
    Some(match ortho.scaling_mode {
        ScalingMode::WindowSize => Vec2::new(width, height),
        ScalingMode::AutoMin {
            min_width,
            min_height,
        } => {
            if width * min_height > min_width * height {
                Vec2::new(width * min_height / height, min_height)
            } else {
                Vec2::new(min_width, height * min_width / width)
            }
        }
        ScalingMode::AutoMax {
            max_width,
            max_height,
        } => {
            if width * max_height < max_width * height {
                Vec2::new(width * max_height / height, max_height)
            } else {
                Vec2::new(max_width, height * max_width / width)
            }
        }
        ScalingMode::FixedVertical { viewport_height } => {
            Vec2::new(width * viewport_height / height, viewport_height)
        }
        ScalingMode::FixedHorizontal { viewport_width } => {
            Vec2::new(viewport_width, height * viewport_width / width)
        }
        ScalingMode::Fixed { width, height } => Vec2::new(width, height),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn viewport_bounds_use_current_orthographic_scale() {
        let transform = Transform::from_xyz(100.0, -50.0, 0.0);
        let projection = Projection::Orthographic(OrthographicProjection {
            scale: 0.5,
            ..OrthographicProjection::default_2d()
        });

        let bounds =
            world_viewport_bounds_for_size(&transform, &projection, Vec2::new(1280.0, 720.0))
                .unwrap();

        assert_eq!(
            bounds,
            WorldViewportBounds {
                min_x: -220.0,
                max_x: 420.0,
                min_y: -230.0,
                max_y: 130.0,
            }
        );
    }

    #[test]
    fn zoom_translation_adjustment_keeps_cursor_world_position() {
        let mut transform = Transform::from_xyz(0.0, 0.0, 0.0);
        let mut projection = Projection::Orthographic(OrthographicProjection {
            scale: 1.0,
            ..OrthographicProjection::default_2d()
        });
        let viewport_size = Vec2::new(1280.0, 720.0);
        let cursor = Vec2::new(960.0, 180.0);
        let before =
            viewport_to_world_2d_for_size(&transform, &projection, viewport_size, cursor).unwrap();

        let Projection::Orthographic(ref mut ortho) = projection else {
            unreachable!();
        };
        ortho.scale = 0.5;
        let after =
            viewport_to_world_2d_for_size(&transform, &projection, viewport_size, cursor).unwrap();
        transform.translation.x += before.x - after.x;
        transform.translation.y += before.y - after.y;

        let stabilized =
            viewport_to_world_2d_for_size(&transform, &projection, viewport_size, cursor).unwrap();
        assert!((stabilized - before).length() < 0.001);
    }
}
