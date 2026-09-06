# ESP32 LED Control Dashboard

โปรเจกต์นี้สร้างขึ้นเพื่อ **ศึกษาการสื่อสารระหว่าง 3 ฝั่ง**:

```
Web Server (เว็บที่ deploy บน GitHub Pages)
        ↕
   Database (Supabase — Postgres + Realtime)
        ↕
      ESP32 (ฮาร์ดแวร์จริง ควบคุม LED 3 ดวง)
```

โดยใช้ **Supabase เป็นตัวกลาง** เชื่อมทั้งสองฝั่งเข้าด้วยกัน แทนที่จะให้เว็บคุยกับ ESP32 ตรงๆ (ซึ่งจะมีปัญหาเรื่อง IP/พอร์ต/NAT ของอุปกรณ์ที่อยู่หลังบ้าน) ทุกฝั่งคุยกับ **ฐานข้อมูลกลาง** แทน — เว็บอ่าน/เขียนได้ ESP32 ก็อ่าน/เขียนได้ และทุกฝั่งจะเห็นการเปลี่ยนแปลงแบบเรียลไทม์ผ่านกลไก Realtime ของ Supabase

โปรเจกต์นี้โฟกัสที่ **ฝั่งเว็บแอปเท่านั้น** (ฝั่ง ESP32 firmware และ Supabase backend ทำเสร็จอยู่แล้ว)

---

## สถาปัตยกรรมและการทำงาน

### 1. ฐานข้อมูลกลาง: ตาราง `device_state`

ทุกฝั่ง (เว็บ และ ESP32) อ่าน/เขียนแถวเดียวกันในตาราง `device_state` ของ Supabase ซึ่งมีคอลัมน์ `led1`, `led2`, `led3` (boolean) — **ไม่มีการเชื่อมต่อ ESP32 ↔ เว็บ โดยตรง** ทุกอย่างผ่านฐานข้อมูลนี้เท่านั้น

### 2. ทิศทางที่ 1 — สั่งจากเว็บไปหา ESP32

```
ผู้ใช้กดปุ่ม / สั่งด้วยเสียง บนเว็บ
        ↓
เว็บเรียก Supabase REST API (UPDATE device_state)
        ↓
ค่าถูกเปลี่ยนในฐานข้อมูล
        ↓
ESP32 poll ค่าจาก Supabase ทุก ~2 วินาที (fetchFromSupabase() ใน firmware)
        ↓
ESP32 เห็นค่าที่เปลี่ยน แล้วสั่ง digitalWrite() ไปที่ขา LED จริง
```

### 3. ทิศทางที่ 2 — สถานะจาก ESP32 กลับมาที่เว็บ (Realtime)

```
มีคนกดปุ่มจริงที่ตัวบอร์ด ESP32 (physical button)
        ↓
ESP32 อัปเดตค่าใน Supabase (updateToSupabase())
        ↓
Supabase Realtime broadcast การเปลี่ยนแปลงนั้นออกไป
        ↓
เว็บที่ subscribe ช่อง Realtime ไว้ (Db.subscribe ใน supabaseClient.js)
        ↓
UI อัปเดตทันทีโดยไม่ต้องกด refresh
```

นี่คือหัวใจของโปรเจกต์: เว็บไม่ได้ "ถาม" ฐานข้อมูลซ้ำๆ (polling) แต่ฐานข้อมูล **"บอก"** เว็บทันทีที่มีการเปลี่ยนแปลง — ใช้ WebSocket ที่ Supabase Realtime เปิดให้ฟรีอยู่แล้วบนตาราง Postgres

### 4. ชั้นเสียง (ต่อยอดจาก data flow เดิม)

เพิ่ม Gemini API เป็นตัวแปลภาษาไทยพูด → คำสั่งโครงสร้าง (JSON) เท่านั้น โดย Gemini **ไม่ได้คุยกับ ESP32 หรือ Supabase โดยตรง** — มันแค่ตอบ JSON กลับมาที่เว็บ แล้วเว็บเป็นคนยิง request ไปอัปเดต Supabase ต่อ (เพื่อให้ data flow หลักยังเหมือนเดิมทุกประการ ไม่ว่าจะสั่งด้วยปุ่มหรือด้วยเสียง)

```
🎤 พูด "สมปอง"        → ระบบตอบ "ครับท่าน" (wake word)
🎤 พูดคำสั่งภาษาไทย    → Speech Recognition (th-TH) แปลงเป็นข้อความ
        ↓
Gemini API ตีความ + คืนสถานะ LED เป้าหมายเป็น JSON
        ↓
เว็บเทียบ diff กับสถานะปัจจุบัน แล้วอัปเดต Supabase (เหมือนข้อ 2 ทุกอย่าง)
        ↓
Supabase Realtime → ESP32 → เว็บ (เหมือนข้อ 2-3)
        ↓
🔊 พูดตอบยืนยันเป็นภาษาไทย (Text-to-Speech)
```

---

## โครงสร้างไฟล์

```
index.html
css/style.css
js/config.js         ค่า Supabase URL/key, ชื่อตาราง, wake word
js/supabaseClient.js  อ่าน/เขียน device_state + subscribe Realtime
js/dashboard.js        วาดแผง LED 3 ดวง, ปุ่ม toggle
js/tts.js               พูดข้อความไทยผ่านลำโพง (Text-to-Speech)
js/gemini.js            เรียก Gemini API, ตรวจสอบ key, แปลงคำสั่งเป็น JSON
js/voice.js              state machine ของ wake word + speech recognition
js/settings.js          เก็บ/ตรวจสอบ Gemini API key ใน localStorage
js/app.js                จุดเริ่มโปรแกรม เชื่อมทุกโมดูลเข้าด้วยกัน
```

---

## Setup

### Supabase (ทำครั้งเดียว)

1. **เปิด Realtime** ให้ตาราง `device_state` — Database → Replication → เพิ่มตารางนี้เข้า publication `supabase_realtime`
2. **ตั้ง RLS policy** ให้ anon key อ่าน/เขียนแถวนี้ได้ เช่น

   ```sql
   alter table device_state enable row level security;

   create policy "Allow anon read" on device_state
     for select using (true);

   create policy "Allow anon update" on device_state
     for update using (true);
   ```

Supabase URL และ anon key ถูกใส่ไว้ใน `js/config.js` แล้ว (ดึงมาจาก firmware ESP32) — anon key ปลอดภัยที่จะฝังในโค้ดฝั่ง client เพราะการป้องกันจริงอยู่ที่ RLS policy ไม่ใช่ตัวคีย์เอง

### Gemini API key (ต่อผู้ใช้แต่ละคน)

ขอคีย์ได้ที่ https://aistudio.google.com/apikey แล้วกรอกใน **AI Settings** บนเว็บ — คีย์จะถูกเก็บใน `localStorage` ของเบราว์เซอร์เท่านั้น ไม่ถูกส่งไปเก็บใน Supabase และไม่ถูก hardcode ในโค้ด

ถ้าไม่กรอกคีย์ ส่วน Dashboard/ปุ่มควบคุม/Realtime ยังใช้งานได้ปกติ มีแค่ Voice Control ที่จะถูกปิดไว้

### รันทดสอบในเครื่อง

```bash
npx serve .
# หรือ
python3 -m http.server 8000
```

ฟีเจอร์ไมค์ต้องรันผ่าน **https หรือ localhost** เท่านั้น เปิดจาก `file://` ตรงๆ จะขอสิทธิ์ไมค์ไม่ได้

### Deploy บน GitHub Pages

1. Push ไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น repo (root หรือ `/docs`)
2. Repo → Settings → Pages → เลือก branch/โฟลเดอร์ที่ push ไว้
3. เข้าใช้งานผ่านลิงก์ `https://username.github.io/repo-name/`

มีไฟล์ `.nojekyll` แนบมาด้วยแล้ว เพื่อให้ GitHub Pages เสิร์ฟไฟล์ตรงๆ ไม่ผ่าน Jekyll

---

## Voice control notes (hold-to-talk, local-first, Gemini as last resort)

Voice control is **hold-to-talk**: press and hold the mic button, speak,
then release — recognition runs for exactly as long as the button is held
(via Pointer Events, so it works the same for mouse, touch, and pen), and
the recognized Thai text is shown on screen before anything is acted on.

**The recognized text is resolved in three tiers, in order, and each tier
is only tried if the one before it found nothing:**

1. **`js/commandParser.js`** — exact local parsing (regex-based). Instant,
   zero network calls, zero cost. Handles clean speech for the full known
   vocabulary: turning led1/led2/led3 on/off individually, in combination
   ("เปิดไฟดวงที่หนึ่งและสอง"), all at once ("เปิดไฟทั้งหมด"), mixed
   on/off in one sentence, and the "จาวิส" easter egg trigger.
2. **`js/fuzzyMatch.js`** — local fuzzy string matching (Levenshtein
   edit-distance), also instant and zero-cost. Catches speech-to-text
   truncation/typos the exact parser misses — e.g. "ดวงที่สอ" instead of
   "ดวงที่สอง" when the mic is released a beat early. It only accepts a
   match when the top candidate clears a confidence threshold **and** beats
   the second-best candidate by a safe margin — otherwise it refuses to
   guess rather than risk acting on the wrong LED. This is plain
   approximate string matching, not machine learning; it runs completely
   offline.
3. **Gemini (`js/gemini.js`)** — the **last resort only**, called only if
   both local tiers above found nothing **and** a Gemini API key is
   configured. Classifies the command into `led_control`, `easter_egg`, or
   `unclear` and, for `led_control`, returns the resulting LED state as
   JSON. If no key is configured and the local tiers can't resolve the
   command, the assistant just says it didn't understand — voice control
   never *requires* a key.

Because most real speech is either exact or only lightly garbled, tiers 1–2
handle the overwhelming majority of commands with no API call at all —
Gemini's rate limits stop being a practical problem for normal use.

Easter eggs: a playful phrase (see `CONFIG.EASTER_EGGS` in `js/config.js`)
plays a local clip instead of touching the LEDs — either a full-page video
(`videoFile`) or background-only audio (`audioFile`); video takes priority
if both are set. Ships with one example: saying something like "เปิดโหมด
จาวิส" plays `video/jarvis-mode.mp4` full-page (a fixed overlay covering
the dashboard, with a skip button, auto-closing when the clip ends) —
**you need to add that file yourself** (see `video/README.md`); it isn't
included in this repo, and must be H.264 MP4 for reliable playback on iOS.
Add more easter eggs by adding entries to `CONFIG.EASTER_EGGS`.
