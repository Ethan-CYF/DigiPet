import { test, expect } from "@playwright/test";
import { cpus, platform, release } from "node:os";

test("offline startup, settings and local actions remain available with denied permissions", async ({ page, context }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("digipet.api.v1")) localStorage.setItem("digipet.api.v1", JSON.stringify({ completed:true, cloudConsent:false }));
    Object.assign(window, { isTauri:true,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener:()=>{} },
      __TAURI_INTERNALS__: { metadata:{currentWindow:{label:"main"}}, transformCallback:()=>1, unregisterCallback:()=>{},
        invoke: async (cmd:string, args:any) => {
          if (cmd === "redact_chat_text") return args.text;
          if (cmd === "tool_reminders") return [];
          if (cmd === "tool_grants") return {tools:[],folders:{}};
          if (cmd === "tool_run") throw Error("Permission denied");
        }
      }
    });
  });
  await page.goto("/"); await context.setOffline(true);
  await page.getByLabel("DigiPet: click to chat, drag to move").press("Enter");
  await expect(page.getByText("Offline / 離線：聊天需連線，本機工具可用。")).toBeVisible();
  await page.getByLabel("Message",{exact:true}).fill("hello"); await page.getByLabel("Send message").click();
  await expect(page.getByRole("alert")).toContainText("Offline: chat requires a network provider");
  await page.getByText("Local tools (offline) / 本機工具（離線）",{exact:true}).click();
  await page.getByText("Run locally / 本機執行",{exact:true}).click();
  await expect(page.getByLabel("Local tool result")).toContainText("Unavailable or denied");
  await page.getByText("Settings / 設定",{exact:true}).click();
  await expect(page.getByLabel("Current appearance")).toBeVisible();
  await page.getByLabel("Open chat on startup").check();
  await page.getByLabel("System prompt").fill("Offline persona");
  await page.getByText("Save preferences / 儲存偏好",{exact:true}).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("digipet.api.v1")!).systemPrompt)).toBe("Offline persona");
  await context.setOffline(false); await page.reload();
  await expect(page.getByLabel("DigiPet chat")).toBeVisible();
});

test("performance baseline: pet keeps drawing during a pending mocked provider and tool operation", async ({ page, browser }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem("digipet.api.v1", JSON.stringify({ completed:true, cloudConsent:true,route:{kind:"openai-compatible",baseUrl:"https://example.test/v1",model:"chat",credentialRef:"11111111-1111-4111-8111-111111111111"} }));
    const draws:number[]=[];
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...args:any[]) { if(this.canvas.width===128) draws.push(performance.now()); return (draw as any).apply(this,args); };
    Object.assign(window,{ m5Draws:draws, __TAURI_INTERNALS__: {
      transformCallback:()=>1, unregisterCallback:()=>{},
      invoke: async (cmd:string, args:any) => {
        if(cmd === "redact_chat_text") return args.text;
        if(cmd === "api_reply") return new Promise(resolve => window.setTimeout(()=>resolve("Mock provider recovered"),1800));
        if(cmd === "tool_run") return new Promise(resolve=>window.setTimeout(()=>resolve({untrusted_data:[]}),1800));
      }
    }});
  });
  await page.goto("/");
  await page.getByLabel("DigiPet: click to chat, drag to move").press("Enter");
  const cdp=await page.context().newCDPSession(page); await cdp.send("Performance.enable");
  const metrics=async()=>Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m=>[m.name,m.value]));
  const first=await metrics();
  await page.getByLabel("Message",{exact:true}).fill("mock slow provider"); await page.getByLabel("Send message").click();
  const start=await page.evaluate(()=>performance.now());
  // Concurrent IPC promise simulates a slow backend; Rust E2E separately exercises real tools.
  await page.evaluate(async()=> { await (window as any).__TAURI_INTERNALS__.invoke("tool_run",{}); });
  await expect(page.getByRole("status")).toHaveText("Mock provider recovered");
  const draws=await page.evaluate(start=>(window as any).m5Draws.filter((t:number)=>t>=start) as number[],start);
  expect(draws.length).toBeGreaterThan(1); // Liveness assertion, no invented FPS budget.
  const last=await metrics();
  const intervals=draws.slice(1).map((t,i)=>t-draws[i]).sort((a,b)=>a-b);
  const output={ environment:{os:platform(),kernel:release(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,node:process.version,chromium:browser.version(),ci:process.env.GITHUB_ACTIONS === "true",runner:process.env.RUNNER_OS ?? "Codex Cloud", image:process.env.ImageOS, imageVersion:process.env.ImageVersion}, scenario:"128x128 canvas, 30Hz scheduler, 1.8s mocked provider + concurrent IPC; no paid calls", samples:draws.length, medianFrameIntervalMs:intervals[Math.floor(intervals.length/2)],p95FrameIntervalMs:intervals[Math.floor(intervals.length*.95)], rendererTaskSeconds:last.TaskDuration-first.TaskDuration,rendererHeapBytes:last.JSHeapUsedSize,rendererHeapDeltaBytes:last.JSHeapUsedSize-first.JSHeapUsedSize };
  await info.attach("m5-performance-baseline",{body:JSON.stringify(output,null,2),contentType:"application/json"});
  // This file goes into the CI artifact along with the environment and test evidence.
  const { writeFile }=await import("node:fs/promises"); await writeFile(info.outputPath("performance-baseline.json"),JSON.stringify(output,null,2));
});
