//! Release-mode FPS budget checks for large example maps.
use crate::gameplay::{GameplayModel, seed_perf_gameplay_entities};
use crate::render::tilemap::RenderMetrics;
use crate::resource::{CursorTile, EditorViewSettings, WorldModel};
use bevy::prelude::*;
use std::cmp::Ordering;
use std::path::PathBuf;
use std::time::Instant;

#[derive(Resource, Debug, Clone)]
pub struct StartupOptions {
    pub map_path: Option<PathBuf>,
    pub no_vsync: bool,
    pub perf_check: Option<PerfCheckConfig>,
    pub gameplay_demo: bool,
    pub flood_demo: bool,
}

impl StartupOptions {
    pub fn from_env() -> Self {
        let mut options = Self {
            map_path: None,
            no_vsync: false,
            perf_check: None,
            gameplay_demo: false,
            flood_demo: false,
        };
        let mut threshold_fps = 150.0;
        let mut warmup_secs = 3.0;
        let mut sample_secs = 5.0;
        let mut motion = PerfMotion::Static;
        let mut zoom_percent = None;
        let mut pan_radius_tiles = 28.0;
        let mut fog = false;
        let mut gameplay_entities = 0;
        let mut perf_check = false;

        let mut args = std::env::args().skip(1);
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--map" => {
                    let Some(path) = args.next() else {
                        fail_usage("--map requires a path");
                    };
                    options.map_path = Some(PathBuf::from(path));
                }
                "--no-vsync" => {
                    options.no_vsync = true;
                }
                "--perf-check" => {
                    perf_check = true;
                    options.no_vsync = true;
                }
                "--perf-threshold" => {
                    threshold_fps = parse_number(args.next(), "--perf-threshold");
                }
                "--perf-warmup" => {
                    warmup_secs = parse_number(args.next(), "--perf-warmup");
                }
                "--perf-sample" => {
                    sample_secs = parse_number(args.next(), "--perf-sample");
                }
                "--perf-motion" => {
                    let Some(raw) = args.next() else {
                        fail_usage("--perf-motion requires static, pan, or zoom");
                    };
                    motion = PerfMotion::parse(&raw);
                }
                "--perf-zoom-percent" => {
                    zoom_percent = Some(parse_number(args.next(), "--perf-zoom-percent") as f32);
                }
                "--perf-pan-radius-tiles" => {
                    pan_radius_tiles = parse_number(args.next(), "--perf-pan-radius-tiles") as f32;
                }
                "--perf-fog" => {
                    fog = true;
                }
                "--perf-gameplay-entities" => {
                    gameplay_entities =
                        parse_number(args.next(), "--perf-gameplay-entities") as usize;
                }
                "--gameplay-demo" => {
                    options.gameplay_demo = true;
                }
                "--flood-demo" => {
                    options.flood_demo = true;
                }
                "--help" | "-h" => {
                    print_usage_and_exit(0);
                }
                _ => {
                    fail_usage(&format!("unknown argument: {arg}"));
                }
            }
        }

        if perf_check {
            if options.map_path.is_none() {
                fail_usage("--perf-check requires --map <path>");
            }
            options.perf_check = Some(PerfCheckConfig {
                threshold_fps,
                warmup_secs,
                sample_secs,
                motion,
                zoom_percent,
                pan_radius_tiles,
                fog,
                gameplay_entities,
                map_path: options.map_path.clone().unwrap_or_default(),
            });
        }

        options
    }
}

#[derive(Resource, Debug, Clone)]
pub struct PerfCheckConfig {
    pub threshold_fps: f64,
    pub warmup_secs: f64,
    pub sample_secs: f64,
    pub motion: PerfMotion,
    pub zoom_percent: Option<f32>,
    pub pan_radius_tiles: f32,
    pub fog: bool,
    pub gameplay_entities: usize,
    pub map_path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PerfMotion {
    Static,
    Pan,
    Zoom,
}

impl PerfMotion {
    fn parse(raw: &str) -> Self {
        match raw {
            "static" => Self::Static,
            "pan" => Self::Pan,
            "zoom" => Self::Zoom,
            _ => fail_usage("--perf-motion must be static, pan, or zoom"),
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Static => "static",
            Self::Pan => "pan",
            Self::Zoom => "zoom",
        }
    }
}

#[derive(Resource, Default)]
pub struct PerfCheckState {
    elapsed_secs: f64,
    sampling: bool,
    sample_elapsed_secs: f64,
    frame_start: Option<Instant>,
    present_frame_times_secs: Vec<f64>,
    workload_frame_times_secs: Vec<f64>,
}

#[derive(Default)]
pub struct PerfMotionState {
    elapsed_secs: f64,
    base_translation: Option<Vec3>,
    base_scale: Option<f32>,
}

pub fn configure_perf_scene(
    config: Option<Res<PerfCheckConfig>>,
    world_model: Res<WorldModel>,
    mut view_settings: ResMut<EditorViewSettings>,
    mut gameplay: ResMut<GameplayModel>,
) {
    let Some(config) = config else {
        return;
    };
    if config.fog {
        view_settings.show_fog_of_war = true;
        view_settings.fog_radius = 10;
        view_settings.fog_softness = 4;
    }
    if config.gameplay_entities > 0 {
        seed_perf_gameplay_entities(&mut gameplay, &world_model.0, config.gameplay_entities);
    }
}

pub fn has_perf_gameplay_entities(config: Option<Res<PerfCheckConfig>>) -> bool {
    config
        .map(|config| config.gameplay_entities > 0)
        .unwrap_or(false)
}

pub fn perf_frame_start_system(mut state: ResMut<PerfCheckState>) {
    state.frame_start = Some(Instant::now());
}

pub fn perf_motion_system(
    time: Res<Time>,
    config: Option<Res<PerfCheckConfig>>,
    world_model: Res<WorldModel>,
    camera: Single<(&mut Transform, &mut Projection), With<Camera2d>>,
    mut state: Local<PerfMotionState>,
) {
    let Some(config) = config else {
        return;
    };

    let (mut camera_transform, mut projection) = camera.into_inner();
    let configured_scale = config
        .zoom_percent
        .map(|percent| 100.0 / percent.max(f32::EPSILON));
    let base_translation = *state
        .base_translation
        .get_or_insert(camera_transform.translation);
    let base_scale = *state.base_scale.get_or_insert_with(|| match *projection {
        Projection::Orthographic(ref mut ortho) => {
            if let Some(scale) = configured_scale {
                ortho.scale = scale;
                scale
            } else {
                ortho.scale
            }
        }
        _ => 1.0,
    });
    state.elapsed_secs += time.delta_secs_f64();

    match config.motion {
        PerfMotion::Static => {}
        PerfMotion::Pan => {
            let tile_px = world_model.tile_size.max(1) as f32;
            let t = state.elapsed_secs as f32;
            camera_transform.translation.x =
                base_translation.x + (t * 0.85).sin() * tile_px * config.pan_radius_tiles;
            camera_transform.translation.y =
                base_translation.y + (t * 0.65).cos() * tile_px * config.pan_radius_tiles * 0.65;
            if let Projection::Orthographic(ref mut ortho) = *projection {
                ortho.scale = base_scale;
            }
        }
        PerfMotion::Zoom => {
            camera_transform.translation = base_translation;
            if let Projection::Orthographic(ref mut ortho) = *projection {
                let t = state.elapsed_secs as f32;
                ortho.scale = (base_scale * (1.0 + (t * 0.9).sin() * 0.25)).max(0.05);
            }
        }
    }
}

pub fn perf_cursor_to_camera_system(
    config: Option<Res<PerfCheckConfig>>,
    world_model: Res<WorldModel>,
    camera: Single<&Transform, With<Camera2d>>,
    mut cursor: ResMut<CursorTile>,
) {
    let Some(config) = config else {
        return;
    };
    if !config.fog {
        return;
    }
    let tile_px = world_model.tile_size.max(1) as f32;
    cursor.x = (camera.translation.x / tile_px).floor() as i32;
    cursor.y = (-camera.translation.y / tile_px).floor() as i32;
    cursor.valid = true;
}

pub fn perf_check_system(
    time: Res<Time>,
    config: Res<PerfCheckConfig>,
    render_metrics: Res<RenderMetrics>,
    mut state: ResMut<PerfCheckState>,
) {
    let present_delta = time.delta_secs_f64();
    if present_delta <= 0.0 {
        return;
    }
    let workload_delta = state
        .frame_start
        .take()
        .map(|start| start.elapsed().as_secs_f64())
        .unwrap_or(present_delta);

    state.elapsed_secs += present_delta;
    if !state.sampling {
        if state.elapsed_secs < config.warmup_secs {
            return;
        }
        state.sampling = true;
        state.sample_elapsed_secs = 0.0;
        state.present_frame_times_secs.clear();
        state.workload_frame_times_secs.clear();
        println!(
            "[glyphweave:perf] sampling {} motion={} zoom_percent={} pan_radius_tiles={:.1} \
             fog={} gameplay_entities={} for {:.1}s after {:.1}s warmup",
            config.map_path.display(),
            config.motion.label(),
            config
                .zoom_percent
                .map(|value| format!("{value:.1}"))
                .unwrap_or_else(|| "default".into()),
            config.pan_radius_tiles,
            config.fog,
            config.gameplay_entities,
            config.sample_secs,
            config.warmup_secs
        );
        return;
    }

    state.sample_elapsed_secs += present_delta;
    state.present_frame_times_secs.push(present_delta);
    state.workload_frame_times_secs.push(workload_delta);
    if state.sample_elapsed_secs < config.sample_secs {
        return;
    }

    let frames = state.present_frame_times_secs.len();
    let present_fps = frames as f64 / state.sample_elapsed_secs;
    let workload_secs: f64 = state.workload_frame_times_secs.iter().sum();
    let workload_fps = frames as f64 / workload_secs.max(f64::EPSILON);
    let present_p95_ms = percentile_frame_ms(&state.present_frame_times_secs, 0.95);
    let present_max_ms = state
        .present_frame_times_secs
        .iter()
        .copied()
        .fold(0.0, f64::max)
        * 1000.0;
    let workload_p95_ms = percentile_frame_ms(&state.workload_frame_times_secs, 0.95);
    let workload_max_ms = state
        .workload_frame_times_secs
        .iter()
        .copied()
        .fold(0.0, f64::max)
        * 1000.0;
    let budget_frame_ms = 1000.0 / config.threshold_fps;
    let pass = workload_fps >= config.threshold_fps;

    println!(
        "[glyphweave:perf] map={} motion={} zoom_percent={} pan_radius_tiles={:.1} \
         fog={} gameplay_entities={} \
         workload_fps={workload_fps:.1} \
         workload_p95_ms={workload_p95_ms:.2} workload_max_ms={workload_max_ms:.2} \
         present_fps={present_fps:.1} present_p95_ms={present_p95_ms:.2} \
         present_max_ms={present_max_ms:.2} render_mode={:?} visible_chunks={} \
         loaded_tile_chunks={} loaded_preview_chunks={} queued_tile_chunks={} \
         tracked_tile_entities={} threshold_fps={:.1} budget_frame_ms={budget_frame_ms:.2}",
        config.map_path.display(),
        config.motion.label(),
        config
            .zoom_percent
            .map(|value| format!("{value:.1}"))
            .unwrap_or_else(|| "default".into()),
        config.pan_radius_tiles,
        config.fog,
        config.gameplay_entities,
        render_metrics.lod_mode,
        render_metrics.visible_chunks,
        render_metrics.loaded_tile_chunks,
        render_metrics.loaded_preview_chunks,
        render_metrics.queued_tile_chunks,
        render_metrics.tracked_tile_entities,
        config.threshold_fps
    );

    std::process::exit(if pass { 0 } else { 1 });
}

fn parse_number(raw: Option<String>, flag: &str) -> f64 {
    let Some(raw) = raw else {
        fail_usage(&format!("{flag} requires a number"));
    };
    match raw.parse::<f64>() {
        Ok(value) if value > 0.0 => value,
        _ => fail_usage(&format!("{flag} must be a positive number")),
    }
}

fn percentile_frame_ms(frame_times_secs: &[f64], percentile: f64) -> f64 {
    if frame_times_secs.is_empty() {
        return f64::INFINITY;
    }
    let mut sorted = frame_times_secs.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    let index = ((sorted.len() as f64 * percentile).ceil() as usize)
        .saturating_sub(1)
        .min(sorted.len() - 1);
    sorted[index] * 1000.0
}

fn fail_usage(message: &str) -> ! {
    eprintln!("glyphweave: {message}");
    print_usage_and_exit(2)
}

fn print_usage_and_exit(code: i32) -> ! {
    eprintln!(
        "usage: glyphweave [--map <path>] [--no-vsync] [--gameplay-demo] [--flood-demo] \
         [--perf-check --perf-motion <static|pan|zoom> --perf-threshold <fps> \
         --perf-warmup <secs> --perf-sample <secs> \
         --perf-zoom-percent <percent> --perf-pan-radius-tiles <tiles> \
         --perf-fog --perf-gameplay-entities <count>]"
    );
    std::process::exit(code);
}
