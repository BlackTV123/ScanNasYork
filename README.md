# ScanNasYork — Quantamental Stock Screener

A high-performance, web-based stock screener designed for Nasdaq-listed equities. Analyzes 5,000+ symbols using both technical (RSI, MACD) and fundamental (EPS, Revenue, P/E, Sector) metrics.

## Quick Start

### Prerequisites
- Node.js 18+ LTS
- MySQL 8.0+
- No API key is needed to import the public Nasdaq and NYSE symbol directories.

### 1. Setup Environment
```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials
```

### 2. Install Dependencies
```bash
cd backend
npm install
```

### 3. Initialize Database
```bash
# Create the database first in MySQL:
# CREATE DATABASE scannas_york CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
npm run db:init
```

### 4. Seed Data (Nasdaq Symbols)
```bash
# Import real stock symbols first (no API key; preserves existing data)
npm run db:seed
```

### 5. Start the Server
```bash
npm run dev
```
Open **http://localhost:3000** for the home page, then choose **Open the screener**, or open **http://localhost:3000/screener.html** directly. The home page previews saved MySQL data; it does not request new Yahoo/SEC data until you open a stock.

The hero's ASCII globe uses `frontend/components/ui/ascii-globe-spin.js`, a Canvas port of the supplied React component. The original `ascii-globe-spin.tsx` is retained alongside it as a reference. This app serves plain HTML/CSS/JavaScript, so the hero needs no React, Tailwind, shadcn, image assets or extra installation. Styles live in `frontend/css/home.css`; the small entry module is `frontend/js/components/hero-globe.js`. The `components/ui` directory keeps reusable UI separate from page code. Drag or use arrow keys to rotate, Home to reset, and Space to pause/resume animation. The globe has no visible buttons, frame, coordinate readout or caption. Reduced-motion preferences disable automatic rotation; animation also stops when the globe is off-screen or the tab is hidden.

On Windows PowerShell, use `Copy-Item .env.example .env` for the initial setup
and `npm.cmd` instead of `npm` if script execution is disabled. Keep credentials
in `backend/.env`; the app does not read `.env.example`.

MySQL uses port `3306` by default. Tables are created from Sequelize models by
`db:init`; the reference `backend/db/schema.sql` also supports MySQL and does not
drop existing tables. Initialization does not populate stock data.

Run `npm.cmd run test:mysql` from `backend` to check database compatibility.
This requires permission to create a temporary database; only the generated
test database is removed afterward. The test never seeds the configured database.
The MySQL connection uses the [mysql2 driver supported by Sequelize](https://sequelize.org/docs/v6/other-topics/dialect-specific-things/).

---

## 🚀 Data Processing (Workers)

### แหล่งข้อมูลและหน้าที่ของแต่ละแหล่ง

ระบบใช้ Yahoo Finance และ SEC EDGAR ร่วมกัน โดยแยกหน้าที่ดังนี้:

| แหล่งข้อมูล | ข้อมูลที่นำมาใช้ | ใช้กับส่วนไหน |
| --- | --- | --- |
| Nasdaq Trader | สัญลักษณ์หุ้นและชื่อบริษัทจากรายชื่อ Nasdaq / NYSE | นำเข้ารายชื่อเริ่มต้นด้วย `db:seed` ไม่ใช่แหล่งราคาหรืองบการเงิน |
| Yahoo Finance | ราคาเปิด สูงสุด ต่ำสุด ปิด และปริมาณซื้อขาย (OHLCV) | Worker คำนวณ RSI, MACD, Bollinger Bands และ ATR ภายในระบบ แล้วบันทึกลง MySQL |
| Yahoo Finance | ข้อมูลบริษัท, Sector, Industry, Market Cap, P/E, EPS ย้อนหลัง 12 เดือน, รายได้, อัตราการเติบโต และราคาเป้าหมาย | Worker อัปเดตข้อมูลพื้นฐานในตาราง `tickers` เพื่อใช้กรองหุ้น |
| Yahoo Finance | ประวัติราคาสำหรับกราฟแท่งเทียน และข้อมูลคาดการณ์ของนักวิเคราะห์ | API ดึงตามคำขอเมื่อเปิดหน้ารายละเอียดหุ้น แล้วแคชผลไว้ชั่วคราว |
| Yahoo Finance | งบย้อนหลังรายปี / รายไตรมาสผ่าน `fundamentalsTimeSeries` | ดึงพร้อม SEC เมื่อประวัติงบขาด หรือใช้สำรองเมื่อ SEC ไม่มีข้อมูลที่รองรับ แล้วบันทึกใน `income_statements` พร้อมสกุลเงินและแหล่งข้อมูล |
| SEC EDGAR | Revenue, Net Income และ EPS จากงบรายปี / รายไตรมาสที่บริษัทยื่น | เก็บประวัติใน `income_statements` เพื่อแสดงตารางงบ กราฟผลประกอบการ และคำนวณจำนวนปีที่รายได้เติบโตต่อเนื่อง |

**Yahoo Finance ใช้ดูราคา ภาพรวมล่าสุด และเป็นแหล่งสำรองงบย้อนหลัง ส่วน SEC EDGAR เป็นแหล่งหลักของงบที่บริษัทยื่นจริง** ข้อมูลคาดการณ์ของนักวิเคราะห์มาจาก Yahoo ไม่ใช่ SEC และอาจไม่มีในหุ้นบางตัว

### การไหลของข้อมูล

```text
Nasdaq Trader → db:seed → MySQL: tickers (รายชื่อหุ้น)
                              ↓
Yahoo Finance → technical worker → ราคา + ตัวชี้วัด → tickers
Yahoo Finance → fundamental worker → ข้อมูลบริษัท + ข้อมูลพื้นฐาน → tickers
SEC EDGAR     → fundamental worker → ประวัติงบ → income_statements
                              ↓
                         API → หน้า Screener และหน้ารายละเอียดหุ้น

Yahoo Finance → API ตามคำขอ → กราฟแท่งเทียน + Analyst Forecast
```

- หน้า **Screener** อ่านข้อมูลที่บันทึกใน MySQL ไม่ได้ดึง Yahoo ใหม่ทุกครั้งที่ค้นหาหรือกดกรอง
- ช่องค้นหาค้นอัตโนมัติหลังหยุดพิมพ์ 350ms หรือกด Enter เพื่อค้นทันที หากไม่พบเพราะตัวกรองจะแสดงปุ่ม **Clear filters, keep search** เพื่อล้างเงื่อนไขโดยเก็บ ticker ไว้ ปุ่ม Reset ล้างทั้งคำค้น ตัวกรอง และโหมด Watchlist
- **การค้นหา:** ถ้าคำตรงกับ ticker ที่มีอยู่ เช่น `nvo` หรือ ` NVO ` จะแสดงเฉพาะ `NVO` โดยยังใช้ตัวกรองอื่นตามปกติ ถ้าไม่ตรง ticker จึงค้นบางส่วนของ ticker/ชื่อบริษัท เช่น `Novo Nordisk` ตัวอักษร `%` และ `_` ถือเป็นข้อความ ไม่ใช่ wildcard และผลค้นหาเก่าที่ตอบกลับช้าจะไม่ทับผลล่าสุด
- หน้า **Stock Detail** อ่านงบที่บันทึกไว้ทันทีผ่าน `/api/v1/stocks/:symbol/financial-chart` และเรียก `/api/v1/stocks/:symbol/snapshot` เพื่ออัปเดตเฉพาะหุ้นที่เปิด: ราคา กราฟ ตัวชี้วัด ข้อมูลบริษัท ข้อมูลพื้นฐาน Analyst Forecast และประวัติงบ ไม่ไล่ดึงหุ้นตัวอื่น ช่วงงบที่ขอเริ่มจากปีปัจจุบันลบ 8 แต่จำนวนปี/ไตรมาสที่ได้จริงขึ้นอยู่กับแต่ละแหล่ง
- **มีข้อมูลแล้วใช้แคชต่อหุ้น 1 นาที:** เปิด XXX ครั้งแรกจะดึงข้อมูลใหม่และบันทึกลง MySQL เมื่อมีข้อมูลกราฟงบทั้ง Annual/Quarterly และ Revenue/EPS แล้ว การเปิด XXX ซ้ำภายใน 60 วินาทีจะใช้ผลเดิม หากเปิด YYY จะมีแคชแยกกัน หลังหมดอายุจะดึงใหม่เมื่อเปิดดูอีกครั้ง ไม่ได้ดึงทุกนาทีเมื่อเปิดหน้าค้างไว้ คำขอพร้อมกันของหุ้นเดียวกันแชร์งานที่กำลังดึงอยู่
- **งบยังขาดให้ลองทั้ง SEC และ Yahoo ทันที:** ถ้า Annual หรือ Quarterly ยังไม่มีข้อมูล Revenue/EPS ที่ใช้ได้ ระบบจะเริ่มดึงงบย้อนหลังจากทั้งสองแหล่งพร้อมกันเฉพาะหุ้นนั้น แม้ผลครั้งก่อนยังอยู่ในแคชก็ลองเติมงบเมื่อเปิดใหม่ ส่วนราคา/ข้อมูลบริษัทที่มีในแคชยังใช้ต่อ และการลองเติมงบไม่ต่ออายุแคชเดิม ค่า `0` ถือเป็นข้อมูลที่มี ไม่ใช่ข้อมูลขาด
- **แหล่งสำรองงบ:** หากมีงบแล้ว ตามปกติจะลองอัปเดต SEC เมื่อแคชหมด ถ้า SEC ล้มเหลว ไม่มี CIK หรือไม่มีงบที่อ่านได้ จะลอง Yahoo ต่อ บันทึกแหล่งที่มาและสกุลเงินลง `income_statements` โดยให้ SEC มีสิทธิ์ก่อนในงวดซ้ำ ไม่เขียนค่าที่หายทับข้อมูลเดิม และไม่ปนยอดต่างสกุลเงิน กราฟ/ตารางแสดงสกุลเงินงบจริง เช่น NVO เป็น DKK ไม่แปลงเป็น USD โดยอัตโนมัติ
- **ราคาและกราฟต้องตรงกัน:** หัวหน้าหุ้นใช้ราคาปิดของแท่งล่าสุดในกราฟจากผลเดียวกัน การกดช่วงกราฟใช้แคช 1 นาทีแยกตามหุ้นและช่วงเวลา และใช้เฉพาะผลการคลิกล่าสุด ไม่ข้ามแคชทุกครั้งเหมือนก่อน
- กราฟรายวันใช้คำนวณ RSI/MACD/Bollinger Bands/ATR และอัปเดต volume พร้อม `last_technical_update` ใหม่ การเปลี่ยนไปกราฟสัปดาห์หรือเดือนอัปเดตราคาที่จับคู่กับกราฟ แต่ไม่ใช้แท่งสัปดาห์หรือเดือนคำนวณตัวชี้วัดรายวัน
- **ข้อมูลบางส่วนล้มเหลว:** เก็บข้อมูลเดิมใน MySQL ไว้แสดง ส่วนที่ดึงสำเร็จยังบันทึกตามปกติ และ API ระบุสถานะของ SEC/Yahoo แยกกัน ถ้ามีประวัติงบแล้ว ผลที่มีคำเตือนยังใช้แคช 1 นาที แต่ถ้างบยังขาดจะลองใหม่เมื่อเปิดหุ้นอีกครั้ง ถ้าทั้งสองแหล่งไม่มีข้อมูลจริงจะไม่สร้างแท่งกราฟขึ้นเอง ค่า TTM ใน `tickers` ไม่ใช่ข้อมูลรายปี/รายไตรมาส
- **อายุแคชอื่น:** กราฟราคาและ Analyst Forecast ใช้ 1 นาที ส่วนผลค้นหา Screener ใช้ 5 นาทีและถูกล้างเมื่อมีข้อมูลหุ้นอัปเดต แคชอยู่ในหน่วยความจำและหายเมื่อรีสตาร์ต backend
- `db:seed` นำเข้าเฉพาะรายชื่อหุ้น จากนั้นเปิดหุ้นเพื่อเติมข้อมูลทีละตัวได้ทันที หากต้องการให้ตัวกรอง Screener มีข้อมูลครบทั้งตลาดล่วงหน้า ให้รัน `update:all` แบบ bulk ตามเดิม
- การเปิดเว็บด้วย `npm run dev` ไม่ได้เริ่ม worker อัตโนมัติ ต้องสั่งอัปเดตเอง หรือเปิด worker ด้วย `--cron`
- Yahoo Finance, SEC EDGAR และรายชื่อ Nasdaq Trader ในระบบนี้ไม่ต้องตั้ง API key ส่วน `FMP_API_KEY` เป็นตัวเลือกสำหรับตรวจปฏิทินประกาศงบเท่านั้น

### SEC EDGAR Integration

- **CIK Mapping:** แปลงสัญลักษณ์หุ้นเป็นรหัส CIK 10 หลัก แล้วเรียกข้อมูล `companyfacts` ของบริษัทนั้น
- **ข้อมูลรายงวด:** แยกงบรายปีและรายไตรมาสจากข้อมูล XBRL; หากมีงบทั้งปีและ Q1–Q3 แต่ไม่มี Q4 ระบบอาจคำนวณ Revenue และ Net Income ของ Q4 ด้วยการหัก Q1–Q3 ออกจากยอดทั้งปี
- **ช่วงประวัติ:** การอัปเดตปกติเลือกข้อมูลตั้งแต่ปีปัจจุบันลบ 1; `--force` หรือ `--full` เลือกตั้งแต่ปีปัจจุบันลบ 8 และปรับได้ด้วย `--years=N` ทั้งนี้ขึ้นอยู่กับข้อมูลที่ SEC มี
- **รอบตรวจ:** การเปิดหน้าหุ้นใช้รอบแคช 1 นาทีและดึง SEC ของหุ้นนั้นใหม่เมื่อแคชหมดอายุ ส่วน bulk worker ยังใช้เงื่อนไขเดิมคือไม่เคยตรวจหรือผ่านไป 90 วัน; หากเปิด FMP และพบหุ้นในปฏิทินงบ จะตรวจได้เมื่อผ่านไป 30 วัน ส่วน `--force` ข้ามเงื่อนไขของ worker นี้
- **การเรียก API:** ใช้ SEC client ร่วมกันภายในแต่ละโปรเซส โดยเข้าคิวทีละคำขอและเว้นจุดเริ่มอย่างน้อย 150ms ส่ง User-Agent จาก `SEC_USER_AGENT` หากตั้งไว้ หรือใช้ค่าเดิมของโปรเจกต์ การจับคู่สัญลักษณ์กับ CIK แคช 24 ชั่วโมง แต่ประวัติงบของหุ้นที่เปิดดูยังเป็นแคช 1 นาทีตามรอบ snapshot

### Run Full Update (Recommended)

Run `npm run db:seed` before the first update. Workers refresh existing symbols;
they do not discover stocks. The importer uses the [Nasdaq Trader symbol directories](https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs), excludes ETFs and test issues, and imports Nasdaq and NYSE listings.
`FMP_API_KEY` is optional and only enables the earnings-calendar check. Leave it empty to use Yahoo Finance and SEC updates without an API key.
This runs technical analysis followed by fundamental updates for all stocks.
```bash
npm run update:all
```

### P/E used by the screener

Both the fundamental worker (`update:all` includes it) and the selected-stock refresh request Yahoo's `summaryDetail` module and save `summaryDetail.trailingPE` to `tickers.pe_ratio`. The screener filters this saved value. Missing P/E values are excluded by numeric P/E filters.

After correcting older imports that read P/E from the wrong Yahoo module, refresh existing rows from the repository root:

```powershell
npm.cmd run worker:fundamental -- --force
```

Without `--force`, the normal 12-hour checkpoint may skip recently updated rows even if their P/E is empty. `--resume` retries missing source checkpoints, not every empty P/E; some stocks legitimately have no Yahoo trailing P/E.

### API limits และความถี่ที่ระบบเรียกใช้

| แหล่งข้อมูล | ข้อจำกัดของผู้ให้บริการ | การทำงานของโค้ดปัจจุบัน |
| --- | --- | --- |
| Yahoo Finance | สำหรับ endpoint ที่เรียกผ่านไลบรารีนี้ ไม่มีตัวเลขโควตาคงที่ที่ระบบรับรองได้ว่าจะไม่ถูกจำกัด หากส่งคำขอถี่เกินไปอาจถูกปฏิเสธชั่วคราว เช่น HTTP 429 | Technical worker แบ่ง 10 หุ้นต่อชุดและพัก 1 วินาทีหลังจบชุด; Fundamental worker แบ่ง Yahoo 20 หุ้นต่อชุด |
| SEC EDGAR | ไม่เกิน 10 requests ต่อวินาที รวมทุกเครื่องของผู้ใช้ และต้องระบุ User-Agent ให้ชัดเจน | SEC client จัดคิวทีละคำขอและเว้นการเริ่มอย่างน้อย 150ms ภายในโปรเซสเดียว; bulk worker ยังพักเพิ่ม 110ms หลังประมวลผลสำเร็จ |

ไลบรารี `yahoo-finance2` เวอร์ชันที่ติดตั้งตั้งค่าเริ่มต้นให้มีงานพร้อมกันสูงสุด **4 งานต่อ instance** ค่านี้เป็น concurrency ของไลบรารี ไม่ใช่โควตาที่ Yahoo รับรอง และไม่ได้กำหนดเพดาน requests ต่อวินาทีให้ระบบทั้งหมด

**Batch size ไม่เท่ากับ requests ต่อวินาที:** การแบ่ง 10 หรือ 20 หุ้นเป็นเพียงการจัดกลุ่มงาน แต่ละคำขอใช้เวลาไม่เท่ากัน และอาจมีคำขอประกอบเพิ่มเติม การเปิดหลาย worker หรือเปิดหน้ากราฟไปพร้อมกันจะเพิ่มจำนวนคำขอรวม เพราะแต่ละ instance มีคิวของตัวเอง

คิว SEC จำกัดภายในโปรเซสเดียว ไม่ใช่ตัวจำกัดอัตรารวมทุกโปรเซส หากเปิดหลาย worker พร้อมกัน ต้องนับคำขอรวมทั้งหมดด้วย เมื่อถูกจำกัดควรหยุดพักและลองใหม่ภายหลัง; worker ปัจจุบันบันทึกข้อผิดพลาดของหุ้นที่ดึงไม่สำเร็จ แต่ยังไม่มีระบบ retry/backoff กลางสำหรับ Yahoo และ SEC

อ้างอิง: [SEC Developer Resources — Fair Access](https://www.sec.gov/about/developer-resources), [SEC User-Agent guidance](https://www.sec.gov/about/webmaster-frequently-asked-questions), [yahoo-finance2 concurrency](https://github.com/gadicc/yahoo-finance2/blob/dev/docs/concurrency.md). ค่าเริ่มต้นของไลบรารีอ้างอิงเวอร์ชันที่ติดตั้งใน repo; เอกสาร upstream อาจมีตัวเลือกเพิ่มเติมในเวอร์ชันใหม่กว่า

### Batching และการข้ามข้อมูลที่เพิ่งอัปเดต

- **Smart Batching:** Technical workers process 10 symbols per batch. Fundamental workers group 20 symbols for Yahoo requests, then process SEC requests sequentially. For example, 6,778 symbols produce 678 technical batches; this is a batch count, not a stock limit.
- **Checkpointing:** Automatically skips stocks updated in the last 12 hours to save resources.
- **Force Update:** Bypass checkpoints and refresh everything immediately:
  ```bash
  npm run update:all -- --force
  ```

### รันต่อเมื่ออัปเดตไม่ครบหรือเครื่อง Sleep

รันจากโฟลเดอร์ `backend` หลังเชื่อมต่ออินเทอร์เน็ตและ MySQL พร้อมแล้ว:

```powershell
npm.cmd run update:all -- --resume
```

โหมดนี้ตรวจ checkpoint ของแต่ละแหล่งข้อมูลแยกกัน:

- Technical: ดึงเฉพาะหุ้นที่ `last_technical_update` ยังว่าง
- Yahoo พื้นฐาน: ดึงเฉพาะหุ้นที่ `last_fundamental_update` ยังว่าง
- SEC: ดึงเฉพาะหุ้นที่ `last_sec_update` ยังว่างและมี CIK mapping แม้ Yahoo ของหุ้นนั้นจะอัปเดตสำเร็จแล้ว
- ไม่ลบข้อมูลเดิม หากถูกขัดจังหวะอีกสามารถรันคำสั่งเดิมซ้ำได้ ส่วนที่บันทึก checkpoint สำเร็จแล้วจะถูกข้าม
- ถ้า Technical บางตัวล้มเหลว `update:all` ยังไปทำ Fundamental ต่อ และจบด้วยสถานะผิดพลาดเมื่อยังมีข้อผิดพลาดจากแหล่งข้อมูล

หากต้องการทำเฉพาะส่วน:

```powershell
npm.cmd run worker:technical -- --resume
npm.cmd run worker:fundamental -- --resume
```

`--resume` คือเติมงานที่ยังไม่มี checkpoint สำเร็จ ไม่ใช่รีเฟรชข้อมูลเก่าทั้งหมด และห้ามใช้ร่วมกับ `--force` / `--full` หากรอบเดิมใช้ `--years=N` ให้ใส่ค่าเดิมร่วมกับ `--resume` เพื่อคงช่วงประวัติงบ หุ้นที่ไม่มี CIK หรือ SEC ไม่มีข้อมูลที่รองรับ อาจไม่มีแถวใน `income_statements` แม้ตรวจสำเร็จแล้ว ส่วนหุ้นที่แหล่งข้อมูลปฏิเสธถาวรอาจยังล้มเหลวเมื่อรันซ้ำ

### คำสั่ง Worker ทั่วไป

```bash
# Run once
npm run worker:technical
npm run worker:fundamental

# Run on schedule (Cron)
npm run worker:technical -- --cron
npm run worker:fundamental -- --cron
```

---

## Share with friends using a Cloudflare Quick Tunnel

With MySQL running, open two PowerShell terminals in the repository root (`D:\SeniorProjectWeb\ScanNasYork`). Run `npm.cmd run tunnel` from this root directory, not from `backend`:

```powershell
# Terminal 1: run the app on port 3000
npm.cmd start

# Terminal 2: cloudflared must already be installed and on PATH
npm.cmd run tunnel
```

Share the HTTPS `*.trycloudflare.com` URL printed by the second command. Anyone with that URL can view saved stock data, refresh individual stocks and change the shared watchlist. Keep the computer awake, connected to the Internet, and both processes running. Press `Ctrl+C` in the tunnel terminal to stop sharing. Starting a new Quick Tunnel generates a new URL. No Cloudflare account, domain or API key is needed. See [Cloudflare Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

If Codex started the tunnel in the background, its PID is recorded in `logs/quick-tunnel.pid` and its URL is in `logs/quick-tunnel.err.log`. Stop that specific process after checking its identity:

```powershell
$scanTunnelId = [int](Get-Content logs/quick-tunnel.pid)
$scanTunnelProcess = Get-Process -Id $scanTunnelId -ErrorAction Stop
if ($scanTunnelProcess.ProcessName -eq 'cloudflared') {
    Stop-Process -Id $scanTunnelId
}
```

## Maintenance

On opening a stock with missing financial history (missing annual/quarterly Revenue or EPS series), the selected-stock refresh starts SEC and Yahoo historical-financial requests concurrently. Yahoo's `fundamentalsTimeSeries` supplies reported annual/quarterly values; rows are saved to `income_statements` with `source_api` and `currency`. SEC takes priority for overlapping periods, null source fields never erase saved figures, and different currencies are never combined in one financial period. Charts label the reported currency; a mixed-currency chart displays the latest reporting currency only.

Complete financial history uses the usual 60-second snapshot cache. Missing history is retried on the next stock opening, even during that minute; concurrent opens share the retry and already-cached price/company data is reused. Retrying missing history does not extend the original cache expiry. An unavailable source cannot guarantee every issuer or period will be filled. Bulk workers retain their existing behavior; the two-provider fallback is triggered by opening the selected stock.

After updating an older checkout, run `npm.cmd run db:init` to add the financial reporting currency column without rebuilding the tables. Existing SEC records retain their USD currency. Restart an already-running backend once after this schema upgrade.

Financial Performance reads saved annual and quarterly history from `/api/v1/stocks/:symbol/financial-chart` immediately, independently of the selected-stock refresh. Failed or slow Yahoo/SEC requests and price-chart errors must not hide saved history. Empty refresh responses cannot erase a displayed saved series. The chart distinguishes a database read failure from a successful read with no saved history. TTM values in `tickers` are not annual/quarterly history; those charts require rows in `income_statements`. The SEC parser supports US-GAAP/USD facts; issuers such as NVO can populate historical charts through the Yahoo fallback in their reported currency.

The active database contains `tickers` (latest screening values), `income_statements` (financial history) and `economic_series` (durable country-economic snapshots with recent observations). Historical price candles are fetched from Yahoo when viewing a stock.

Use `worker:fundamental` for descriptions, valuation, target prices and financial growth; use `worker:technical` for prices and indicators. To target one stock, add `-- --symbol=SMCI --force`. The fundamental worker already includes Q4 completion, so separate patch scripts are unnecessary.

For database diagnostics, run `node backend/scripts/check-db.js` for data coverage or `node backend/scripts/check-financials.js` for saved financial periods. The automated test suite lives in `backend/test/`.

## Forex, gold and oil

ทุกหน้ามีปุ่มเมนูรูปสามขีด **มุมบนซ้ายของหน้าจอ** ตำแหน่งคงที่ห่างขอบ 16px แม้เลื่อนหน้าหรือเปลี่ยนหน้า พื้นที่กด 44px และมีชื่อสำหรับโปรแกรมอ่านหน้าจอ เปิด Sidebar สำหรับไป Home, Screener และ Forex ได้ ปิดด้วยปุ่มกากบาท, Escape หรือคลิกพื้นหลัง เมื่อเปิด Sidebar โฟกัสจะอยู่ภายในเมนูและกลับไปปุ่มเดิมเมื่อปิด

หน้า `/forex.html` รองรับ EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/DKK, USD/CHF, USD/THB, ทอง, WTI และ Brent โดยเลือกสินทรัพย์จากรายการหรือ dropdown บนมือถือได้

- **กราฟราคา:** เลือก Candle timeframe `5m / 15m / 30m / 1H / 4H / 1D / 1W` โดยระบบเลือกช่วงย้อนหลังเองตามลำดับ 7 / 14 / 31 / 59 / 180 / 730 / 1826 วัน ดึง Yahoo Finance ตามตัวที่เปิดและแคช 1 นาทีต่อสินทรัพย์/timeframe ไม่มี polling ราคาด้านบนมาจากแท่งสุดท้ายของกราฟเดียวกัน แสดงช่วงข้อมูลที่ได้จริงและซูมหรือเลื่อนดูย้อนหลังได้ 4H รวมจาก 1H ตามขอบ UTC โดยไม่เติมแท่งในช่วงข้อมูลว่าง ดูรายละเอียดใน [เอกสาร Forex economics](docs/forex-economics.md)
- **ข้อมูลพื้นฐานราคา:** ราคาเปิด, ปิดก่อนหน้า, ช่วงวัน/52 สัปดาห์, Bid/Ask ที่ใช้ได้, Volume และตลาด ตามที่ Yahoo ส่งมา ไม่มีค่าจะแสดงว่าไม่พร้อมใช้ คู่เงินไม่มีปริมาณซื้อขายรวมจากตลาดกลาง จึงไม่ใช้ค่า 0 แทนข้อมูลที่ไม่ได้รายงาน
- **ประเภทสัญญา:** ทองใช้ `GC=F`, WTI ใช้ `CL=F`, Brent ใช้ `BZ=F` เป็น futures ไม่ใช่ราคาทองหน้าร้านหรือ spot ราคาบางสินทรัพย์อาจล่าช้า และการเปลี่ยนสัญญาอาจมีผลต่อกราฟ
- **ข้อมูลเศรษฐกิจจริง:** ดึง CSV สาธารณะจาก FRED โดยไม่ใช้ API key แคช 1 ชั่วโมงต่อ series ได้แก่ DFF (Effective Fed funds rate), CPIAUCSL (คำนวณ CPI YoY จากดัชนีที่ปรับฤดูกาล), DGS10 (พันธบัตรสหรัฐฯ 10 ปี), DFII10 (real yield 10 ปี), DTWEXBGS (ดัชนีดอลลาร์แบบกว้าง ฐาน ม.ค. 2006 = 100 ไม่ใช่ DXY) แต่ละรายการแสดงวันที่ observation และลิงก์แหล่งข้อมูล
- **เปรียบเทียบประเทศ:** `/api/v1/markets/:instrument/economics` ส่งดอกเบี้ย benchmark, อัตราก่อนหน้าที่ต่างจากปัจจุบัน, Headline CPI YoY และ MoM ไม่ปรับฤดูกาล เทียบสองฝั่งของคู่เงิน ครอบคลุม US, Euro area, UK, Japan, Australia, Canada, Denmark, Switzerland และ Thailand ทอง/น้ำมันใช้บริบท US โดยมีแหล่งข้อมูลระดับประเทศและนิยามใน Sources & definitions ส่วนของ FRED เดิมยังเป็น US backdrop แยกต่างหาก ไม่ใช้ Effective Fed funds แทน policy target
- **ที่มาและข้อจำกัด:** ใช้ BIS `WS_CBPOL` (daily observations เผยแพร่รายสัปดาห์) และ `WS_LONG_CPI` (monthly observations เผยแพร่รายเดือน) โดยไม่ต้องมี API key คำนวณ CPI เทียบเดือนเดียวกันปีก่อน/เดือนก่อนจากดัชนี NSA ของ BIS ซึ่งอาจต่างจากตัวเลขประกาศเพราะการปัดเศษ ข้อมูลอาจช้ากว่าประกาศในประเทศ แสดงงวดข้อมูลแยกจากเวลาดึงล่าสุด ออสเตรเลียเป็น series รายเดือนที่ BIS สร้างจากข้อมูลรายไตรมาส จึงไม่แสดง MoM ห้ามตีความ benchmark ทุกประเทศเป็นอัตราประเภทเดียวกันหรือส่วนต่างดอกเบี้ยที่เทียบกันได้ทันที
- **ข้อมูลสำรองเศรษฐกิจ:** รัน `npm.cmd run db:init` หลังอัปเดตเพื่อสร้างตาราง `economic_series` แบบไม่ลบข้อมูลเดิม เก็บ JSON snapshot ต่อประเทศ/ชุดข้อมูล รวม observations ช่วงย้อนหลังประมาณ 800 วันและ metadata ตรวจแหล่งข้อมูลทุก 6 ชั่วโมงเมื่อมีคำขอ (ไม่ใช่ timer) ค่าหมดอายุยังแสดงจาก MySQL ระหว่างรีเฟรชเบื้องหลัง และอ่านข้อมูลใหม่ได้เมื่อเปิด/กด Reload economics ครั้งถัดไป คำขอพร้อมกันแชร์งานเดียว พักลองซ้ำ 1 นาที ข้อมูลหายหรือ API ล้มเหลวไม่ลบค่าที่บันทึกไว้ หากเขียน SQL ไม่ได้ UI แจ้งว่าอาจมีเพียงข้อมูลในหน่วยความจำ ไม่มีการเขียนลงตารางหุ้น
- **Core CPI / underlying inflation:** เชื่อมครบ 9 ประเทศ/เขตเศรษฐกิจ พร้อมนิยามเฉพาะประเทศและ SA/NSA เปิดตัวเพิ่มเติมของ CAD, AUD และ JPY ได้ สวิสใช้ HICP แบบ harmonised ทางเลือก ไม่ใช่ FSO core inflation 1 หรือ SNB TM15 แคนาดาไม่มี MoM ใน feed จึงแสดง Unavailable เก็บใน economic_series เดิมและแคช 6 ชั่วโมง ดูรายละเอียดและแหล่งอ้างอิงใน [เอกสาร Forex economics](docs/forex-economics.md)
- **งานระยะถัดไป:** GDP, employment, ปฏิทินพร้อม Actual/Previous/Forecast และข้อมูล inventory น้ำมัน ยังไม่ได้เชื่อม ไม่แสดงค่าคาดการณ์หรือวันประกาศที่สร้างขึ้นเอง คำอธิบายของแต่ละสินทรัพย์เป็นปัจจัยทั่วไป ไม่ใช่สัญญาณซื้อขาย
- **เมื่อแหล่งข้อมูลล้มเหลว:** ใช้ผลเดิมในหน่วยความจำถ้ามีและระบุว่า cached/stale แยกจากข้อมูลใหม่ แต่ละ series ของ FRED ล้มเหลวแยกกันได้ มีช่วงพักการลองซ้ำ 30 วินาที ไม่มีการเก็บ Forex/FRED ลงตารางหุ้น MySQL และแคชหายเมื่อ backend รีสตาร์ต

แหล่งอ้างอิง: [Yahoo EUR/USD](https://finance.yahoo.com/quote/EURUSD%3DX/), [Yahoo gold futures](https://finance.yahoo.com/quote/GC%3DF/), [FRED DFF](https://fred.stlouisfed.org/series/DFF), [FRED CPI](https://fred.stlouisfed.org/series/CPIAUCSL), [FRED Treasury yield](https://fred.stlouisfed.org/series/DGS10), [FRED real yield](https://fred.stlouisfed.org/series/DFII10), [FRED broad dollar index](https://fred.stlouisfed.org/series/DTWEXBGS).

## Project layout

```text
backend/
  api/
    controllers/       Stock API handlers
    routes/            stocks.js, markets.js
    validators.js      Stock query validation
    server.js          Express server entry point
  services/
    stocks/            Stock snapshots, chart data, SEC/Yahoo history and forecasts
    markets/           Market prices, FRED, country economics and MySQL snapshot store
  workers/             Bulk stock technical/fundamental updates
  db/                  MySQL connection, schema, initialization and seeding
  models/              Ticker, IncomeStatement and EconomicSeries models
  scripts/             Manual diagnostics and column migration tools
  test/                Automated regression and isolated MySQL tests
  utils/               Shared indicators, logging and worker/import helpers
frontend/
  index.html           Default entry: Home and hero
  screener.html        Stock screener
  stock.html           Individual stock
  forex.html           Forex, gold, oil and economic context
  js/
    pages/             One script per page
    shared/            Shared API client and formatting utilities
    components/        Hero globe initialization and shared navigation sidebar
  components/ui/       Reusable ASCII globe implementation and TSX reference
  css/                 Shared tokens/base/layout and page styles
```

Run `npm.cmd start` or `npm.cmd run dev` from the root or `backend`; these commands are unchanged. Run `npm.cmd run tunnel` from the repository root only. Run `npm.cmd run db:check` or `npm.cmd run db:check-financials` from either directory for diagnostics. Run `npm.cmd test` from either directory for the automated suite, or `npm.cmd --prefix backend run test:markets` from the root for Forex/FRED/country-economics tests only.

## Architecture

```
┌─────────────────────────────────────────┐
│         Frontend (Vanilla JS)           │
│ Home │ Screener │ Stock │ Forex & macro│
└────────────────┬────────────────────────┘
                 │ REST API
┌────────────────┴────────────────────────┐
│         Express.js API Server           │
│  Dynamic SQL Query Builder + Caching    │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│         MySQL Database             │
│  Tickers (latest) + Income_Statements │
└─────────────────────────────────────────┘
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/stocks/screen` | Multi-criteria screening |
| GET | `/api/v1/stocks/sectors` | Available sectors list |
| GET | `/api/v1/stocks/:symbol` | Stock detail (pre-computed indicators) |
| GET | `/api/v1/stocks/:symbol/snapshot` | Refresh all sources for the selected stock only; share the full result for 1 minute |
| GET | `/api/v1/stocks/:symbol/chart` | Yahoo candle history and matching price snapshot (1d/1w/1m/3m); `refresh=true` bypasses the 1-minute cache |
| GET | `/api/v1/stocks/:symbol/forecast` | On-demand analyst target & EPS/revenue projections |
| GET | `/api/v1/stocks/:symbol/financial-chart` | Chronological Revenue/EPS historical charts data |
| GET | `/api/v1/markets/instruments` | Allowlisted Forex and commodity instrument catalog |
| GET | `/api/v1/markets/:instrument/chart?timeframe=1h` | Candle timeframe: 5m/15m/30m/1h/4h/1d/1wk; automatic lookback; matching price; 1-minute cache |
| GET | `/api/v1/markets/macro` | US economic observations from FRED; 1-hour per-series cache and partial availability |
| GET | `/api/v1/markets/:instrument/economics` | Selected-country BIS policy/CPI comparison; 6-hour source check, durable MySQL fallback |
| GET | `/api/health` | Health check |

## Tech Stack
- **Backend:** Node.js, Express, Sequelize ORM, MySQL
- **Frontend:** Vanilla HTML/CSS/JS, TradingView Lightweight Charts (v4)
- **Data:** Yahoo Finance (stocks, Forex and commodity futures), SEC EDGAR (stock financial history), Nasdaq Trader (symbol directory), BIS (country policy/CPI), FRED (US economic observations), Eurostat, ONS, Statistics Bureau of Japan, ABS, Bank of Canada, Statistics Denmark and TPSO (country core inflation)

---

## Detailed Requirements
For complete System Overview, Functional Requirements (FR), and Non-Functional Requirements (NFR) specifications, refer to [system_requirements.md](system_requirements.md).
