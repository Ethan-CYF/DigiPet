//! Test-only JSON-lines bridge for orchestrator ↔ real Rust tools integration tests.
//! Never shipped or registered in the desktop application.
use digipet_tools::Engine;
use serde_json::{json, Value};
use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
};
fn main() {
    let root = PathBuf::from(std::env::args().nth(1).expect("fixture root"));
    let mut engine = Engine::open(root.join("data")).expect("fixture storage");
    for line in io::stdin().lock().lines() {
        let response = (|| -> Result<Value, String> {
            let v: Value = serde_json::from_str(&line.map_err(|_| "Input failed")?)
                .map_err(|_| "Invalid fixture input")?;
            let tool = v["tool"].as_str().unwrap_or("");
            match v["op"].as_str() {
                Some("grant") => engine
                    .grant(tool, true, Some(root.join("project")))
                    .map(|_| json!({})),
                Some("grants") => Ok(json!(engine.grants())),
                Some("run") => engine.run(tool, v["args"].clone()),
                Some("confirm") => engine.confirm(
                    v["token"].as_str().unwrap_or(""),
                    v["approved"].as_bool().unwrap_or(false),
                ),
                Some("cancel") => {
                    engine.cancel();
                    Ok(json!({}))
                }
                _ => Err("Invalid fixture command".into()),
            }
        })();
        println!(
            "{}",
            match response {
                Ok(v) => json!({"ok":v}),
                Err(e) => json!({"error":e}),
            }
        );
        io::stdout().flush().unwrap();
    }
}
