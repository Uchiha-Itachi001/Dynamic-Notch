use crate::models::types::SystemMetrics;
use crate::services::system_metrics;

#[tauri::command]
pub fn get_system_metrics() -> SystemMetrics {
    system_metrics::get_system_metrics()
}
