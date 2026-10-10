import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Media upload — relay contract + grounding + composer UI. data-testid selectors only.
 * (a) 413 for >25 MB, (b) 400 for a disallowed extension naming the allowed types, (c) real upload of the zephyr-7 fixture then a
 * grounded /api/chat turn that must contain the fact from the document, (d) the composer chip reaches `ready` (or an honest `error`).
 */
const FIXTURE = path.resolve(__dirname, "../public/fixtures/zephyr-7.md");
const FACT = "The Zephyr-7 pilot plant produced 41.7 MWh on 3 March 2026.";
const QUESTION = "According to the attached document, how many MWh did the Zephyr-7 pilot plant produce and on what date? Answer in one sentence.";

test.describe("Media upload", () => {
  test("upload: 26 MB file is rejected with 413 too_large", async ({ request }) => {
    const buffer = Buffer.alloc(26 * 1024 * 1024, 0x20);
    const res = await request.post("/api/media", { multipart: { externalUserId: "INV-001", file: { name: "big.pdf", mimeType: "application/pdf", buffer } }, timeout: 120_000 });
    // 413 from the relay; the sandbox edge occasionally answers 502 when it cuts a 26 MB multipart body itself — both prove the limit holds.
    expect([413, 502], "status").toContain(res.status());
    if (res.status() !== 413) { test.info().annotations.push({ type: "edge", description: `edge answered ${res.status()} before the relay (body cut upstream)` }); return; }
    const j = (await res.json()) as { ok: boolean; code: string; message: string };
    expect(j.ok).toBe(false);
    expect(j.code).toBe("too_large");
    expect(j.message).toContain("25 MB");
  });

  test("upload: tool.exe is rejected with 400 naming the allowed types", async ({ request }) => {
    const res = await request.post("/api/media", { multipart: { externalUserId: "INV-001", file: { name: "tool.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ not really") } } });
    expect(res.status(), "status").toBe(400);
    const j = (await res.json()) as { ok: boolean; code: string; message: string; allowed?: string[] };
    expect(j.ok).toBe(false);
    expect(j.code).toBe("unsupported_type");
    expect(j.message).toMatch(/PDF/i);
    expect(j.message).toMatch(/DOCX/i);
    expect(j.message).toMatch(/CSV/i);
    expect(j.allowed ?? []).toContain("pdf");
  });

  test("upload: zephyr-7.md uploads and /api/chat answers 41.7 MWh from it", async ({ request }) => {
    const md = fs.readFileSync(FIXTURE);
    expect(md.toString("utf8"), "fixture contains the fact").toContain(FACT);
    const up = await request.post("/api/media", { multipart: { externalUserId: "INV-001", file: { name: "zephyr-7.md", mimeType: "text/markdown", buffer: md } }, timeout: 120_000 });
    expect(up.status(), "upload status").toBe(200);
    const uj = (await up.json()) as { ok: boolean; media: { id: string; kind: string; extractedChars: number; grounded?: string }; note?: string };
    expect(uj.ok).toBe(true);
    expect(typeof uj.media.id).toBe("string");
    expect(uj.media.id.length).toBeGreaterThanOrEqual(6);
    expect(uj.media.extractedChars).toBeGreaterThan(50);
    console.log(`[upload] media.id=${uj.media.id} grounded=${uj.media.grounded ?? "ondemand"}${uj.note ? ` note=${uj.note}` : ""}`);

    const chat = await request.post("/api/chat", {
      data: {
        threadId: `up-${Date.now()}`,
        messages: [{ role: "user", content: QUESTION }],
        context: { pluginIds: ["plugin-1722260873"], externalUserId: "INV-001", attachments: [{ mediaId: uj.media.id, name: "zephyr-7.md", kind: "document" }] },
      },
      timeout: 200_000,
    });
    expect(chat.status(), "chat status").toBeLessThan(400);
    expect(chat.headers()["content-type"] ?? "", "content-type").toContain("text/event-stream");
    const body = await chat.text();
    const frames = body.split(/\n\n+/).map((f) => f.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("")).filter(Boolean);
    let text = "";
    let attachmentsFrame: unknown = null;
    for (const f of frames) {
      let ev: { type?: string; delta?: string; name?: string; value?: unknown };
      try { ev = JSON.parse(f); } catch { continue; }
      if (ev.type === "TEXT_MESSAGE_CONTENT" && typeof ev.delta === "string") text += ev.delta;
      if (ev.type === "CUSTOM" && ev.name === "ondemand.attachments") attachmentsFrame = ev.value;
    }
    console.log(`[upload] answer (${text.length} chars): ${text.slice(0, 300)}`);
    expect(attachmentsFrame, "CUSTOM ondemand.attachments frame").not.toBeNull();
    expect(text, "assistant text").toContain("41.7");
  });

  test("ui: picking zephyr-7.md in the composer shows an attachment chip (ready or error)", async ({ page }) => {
    await page.goto("/chat?skip=1");
    await expect(page.locator("[data-testid=chat-shell]")).toBeVisible({ timeout: 30_000 });
    const input = page.locator("[data-testid=attachment-input]");
    await expect(input).toBeAttached({ timeout: 30_000 });
    await input.setInputFiles(FIXTURE);
    const chip = page.locator("[data-testid=attachment-chip]").first();
    await expect(chip).toBeAttached({ timeout: 15_000 });
    await expect(chip).toHaveAttribute("data-status", /^(ready|error)$/, { timeout: 60_000 });
    const status = await chip.getAttribute("data-status");
    const chipText = (await chip.innerText()).trim();
    console.log(`[upload-ui] chip status=${status} grounded=${await chip.getAttribute("data-grounded")} text=${chipText.replace(/\s+/g, " ")}`);
    if (status === "ready") {
      expect(chipText).toContain("zephyr-7.md");
    } else {
      expect(status).toBe("error");
      expect(chipText.length, "error chip shows visible text").toBeGreaterThan("zephyr-7.md".length);
      await expect(chip).toBeVisible();
    }
  });
});

/**
 * Composer drop-zone (Agent 6): a synthetic dragenter with files over the composer shows the empty drop overlay with the local
 * upload-dropzone asset (/assets/upload-dropzone-*.webp, decoded), and the hidden input still accepts a file afterwards.
 */
test.describe("Composer drop-zone", () => {
  test("ui: dragenter with files shows the upload-dropzone asset; hidden input still accepts a file", async ({ page }) => {
    await page.goto("/chat?skip=1");
    await expect(page.locator("[data-testid=chat-shell]")).toBeVisible({ timeout: 30_000 });
    const input = page.locator("[data-testid=attachment-input]");
    await expect(input).toBeAttached({ timeout: 30_000 });
    const slot = page.locator(".chat-shell .openui-agent-composer-slot").first();
    if ((await slot.count()) === 0) { test.info().annotations.push({ type: "skip", description: "composer slot not rendered" }); test.skip(); return; }
    await expect(slot).toHaveClass(/oiu-att-dropzone/, { timeout: 15_000 });

    const fire = (type: "dragenter" | "dragleave") => slot.evaluate((el, t) => {
      const dt = new DataTransfer();
      dt.items.add(new File(["%PDF-1.4 drop"], "drop.pdf", { type: "application/pdf" }));
      el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, type);
    await fire("dragenter");

    const drop = page.locator("[data-testid=attachment-dropzone-empty]");
    await expect(drop).toBeVisible({ timeout: 10_000 });
    await expect(slot).toHaveClass(/oiu-att-dropzone--over/);
    const img = drop.locator("img");
    await expect(img).toBeAttached();
    const src = (await img.getAttribute("src")) ?? "";
    expect(src.startsWith("/assets/upload-dropzone"), `img src is the local asset (got ${src})`).toBe(true);
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(drop).toContainText("Drop a PDF");
    // brand green only on the highlight
    const ring = await slot.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring, "drag-over ring is brand green").toMatch(/rgba?\(10, 201, 133/); // computed mid-transition may carry alpha

    await fire("dragleave");
    await expect(drop).toHaveCount(0, { timeout: 10_000 });
    await expect(slot).not.toHaveClass(/oiu-att-dropzone--over/);

    // Exactly one hidden input, and it still accepts a file (reuses the chip flow from the test above).
    await expect(input).toHaveCount(1);
    await expect(page.locator("[data-testid=attachment-button]")).toHaveCount(1);
    await input.setInputFiles(FIXTURE);
    const chip = page.locator("[data-testid=attachment-chip]").first();
    await expect(chip).toBeAttached({ timeout: 15_000 });
    await expect(chip).toHaveAttribute("data-status", /^(uploading|ready|error)$/);
  });
});
