# Forex economics

หน้า Forex ใช้ข้อมูลจริง ไม่ใช่ demo และไม่ถือว่า Core CPI ของทุกประเทศมีนิยามเดียวกัน
ตัวหลักอยู่ในส่วนเงินเฟ้อพื้นฐานของประเทศนั้น ตัวเพิ่มเติมเปิดได้ใน **Other inflation measures**
ทุกตัวแสดงชื่อ นิยาม ความถี่ งวดข้อมูล การปรับฤดูกาล และลิงก์แหล่งข้อมูล

| สกุลเงิน | ตัวหลักที่เชื่อม | ตัวเพิ่มเติม | ที่มา / วิธีรายงาน |
|---|---|---|---|
| USD | CPI-U ไม่รวมอาหารและพลังงาน | — | BLS ผ่าน FRED: YoY จาก CPILFENS (NSA), MoM จาก CPILFESL (SA); คำนวณจากดัชนี |
| EUR | HICP ไม่รวมพลังงาน อาหาร แอลกอฮอล์และยาสูบ | — | Eurostat `prc_hicp_minr`, พื้นที่ EA แบบเปลี่ยนสมาชิกตามเวลา; YoY/MoM ที่เผยแพร่ NSA |
| GBP | CPI ไม่รวมพลังงาน อาหาร แอลกอฮอล์และยาสูบ | — | ONS MM23: DKO8 YoY, DKI7 MoM; อัตราที่เผยแพร่ NSA |
| JPY | CPI ไม่รวมอาหารสด **ยังรวมพลังงาน** | CPI ไม่รวมอาหารสดและพลังงาน | Statistics Bureau of Japan ไฟล์ดัชนีฐาน 2025; คำนวณ YoY/MoM แบบ NSA โดย MoM นี้ไม่ใช่ค่าปรับฤดูกาลของญี่ปุ่น |
| AUD | Trimmed mean CPI | Weighted median CPI | ABS CPI ข้อมูลรายเดือนระดับประเทศแบบ SA; ตัดส่วนปลายของการเปลี่ยนราคาอย่างละ 15% สำหรับ trimmed mean |
| CAD | CPI-trim | CPI-median | Statistics Canada ผ่าน Bank of Canada Valet; YoY จากส่วนประกอบแบบ SA ตัดส่วนปลายอย่างละ 20% สำหรับ trim; **ไม่มี MoM ใน feed นี้** จึงไม่คำนวณ MoM จากอัตรา YoY |
| DKK | CPI ไม่รวมพลังงานและอาหารที่ยังไม่แปรรูป | — | Statistics Denmark PRIS01 กลุ่ม 151; อัตรา YoY/MoM ที่เผยแพร่ NSA |
| CHF | Core HICP แบบ harmonised | — | Eurostat `prc_hicp_minr`, CH, ไม่รวมพลังงาน อาหาร แอลกอฮอล์และยาสูบ; YoY/MoM NSA ตัวนี้เป็น **มาตรวัดทางเลือก** ไม่ใช่ FSO core inflation 1 หรือ SNB TM15 และไม่ได้อ้างว่าเป็นตัวหลักที่ SNB ใช้ |
| THB | Core CPI ไม่รวมอาหารสดและพลังงาน | — | TPSO กระทรวงพาณิชย์ endpoint สาธารณะที่หน้า Indicators ใช้: cpig-core, ระดับประเทศ region 5, ฐาน 2023; YoY/MoM ที่เผยแพร่ NSA |

SA = ปรับฤดูกาล, NSA = ไม่ปรับฤดูกาล ตัวเลขต่างนิยามและต่างงวดไม่ควรนำมาเทียบเหมือนเป็นตะกร้าเดียวกัน
Weighted median คือการเปลี่ยนราคาตรงเปอร์เซ็นไทล์ที่ 50 ตามน้ำหนัก ไม่ใช่ค่าเฉลี่ยของ trimmed mean

## แหล่งข้อมูล

- [BLS Core CPI ผ่าน FRED แบบ SA](https://fred.stlouisfed.org/series/CPILFESL) และ [NSA](https://fred.stlouisfed.org/series/CPILFENS)
- [Eurostat HICP ปัจจุบัน](https://ec.europa.eu/eurostat/web/hicp/information-data): ใช้ `prc_hicp_minr` / `coicop18=TOT_X_NRG_FOOD` หลังย้ายเป็น ECOICOP 2 ในปี 2026; ไม่ใช้ `prc_hicp_manr` เก่าที่หยุดปี 2025
- [ONS Core CPI](https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/dko8/mm23): ใช้ CSV generator ของเว็บทางการ ไม่ใช้ API รุ่นที่เลิกบริการแล้ว
- [Statistics Bureau of Japan](https://www.stat.go.jp/english/data/cpi/)
- [ABS CPI](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia/latest-release)
- [Bank of Canada: CPI และนิยาม preferred core measures](https://www.bankofcanada.ca/rates/price-indexes/cpi/)
- [Statistics Denmark PRIS01](https://www.statbank.dk/PRIS01)
- [TPSO Indicators](https://tpso.go.th/en/indicators)

## Candle timeframe และช่วงย้อนหลังอัตโนมัติ

ปุ่มกราฟเลือกขนาดแท่งเทียน ไม่ใช่ระยะย้อนหลัง เช่น 1D = หนึ่งแท่งต่อวัน และ 1W = หนึ่งแท่งต่อสัปดาห์
ระบบเริ่มที่ 1H และเลือกประวัติให้เอง:

| ปุ่ม | Yahoo interval | ช่วงที่ขอโดยประมาณ |
|---|---|---|
| 5m | 5m | 7 วัน |
| 15m | 15m | 14 วัน |
| 30m | 30m | 31 วัน |
| 1H | 1h | 59 วัน |
| 4H | 1h แล้วรวมเอง | 180 วัน |
| 1D | 1d | 730 วัน |
| 1W | 1wk | 1826 วัน |

ช่วงนี้เป็นจำนวนวันปฏิทินที่ขอ ไม่ใช่จำนวนวันที่รับประกันว่าจะมีข้อมูล Yahoo อาจให้ประวัติน้อยกว่าเพราะข้อจำกัดหรือเวลาทำการของตลาด
UI แสดงจำนวนแท่งกับวันเริ่ม/สิ้นสุดที่ได้รับจริง เปิดให้เห็นแท่งล่าสุดในระยะอ่านง่าย แล้วซูมหรือเลื่อนย้อนหลังได้ การปรับขนาดหน้าจอไม่สั่ง fit ทั้งประวัติใหม่

- 4H รวม Open จากชั่วโมงแรก, High สูงสุด, Low ต่ำสุด และ Close ของชั่วโมงท้าย แบ่งที่ 00/04/08/12/16/20 UTC ไม่ใช่ 4H ตามเวลาไทยหรือโบรกเกอร์
- ลบ timestamp ซ้ำก่อนรวม ถ้า Yahoo แถมราคา live เป็นแถวท้าย จะรวมเข้าช่วงเดิมโดยไม่ลบ Open/High/Low ที่มีอยู่
- ช่วงตลาดปิดหรือไม่มีข้อมูลไม่สร้างแท่งศูนย์หรือแท่งเติม ถ้าแท่งท้ายยังไม่ครบ 4 ชั่วโมงหรือแหล่งข้อมูลส่งมาไม่ครบ จะแจ้งว่า incomplete
- Intraday แสดงแกนเวลา UTC; รายวัน/สัปดาห์ใช้วันตาม exchange timezone ของ Yahoo และเก็บวันเริ่มสัปดาห์ตามชุดข้อมูลต้นทาง
- ราคาด้านบนเป็น Close ของแท่งสุดท้ายที่แสดง ส่วน Last source candle เป็น timestamp ของแถวล่าสุดที่ Yahoo ส่งมา จึงอาจช้ากว่าราคาตลาดจริง
- แคชแยกตามสินทรัพย์และ timeframe 60 วินาที เปลี่ยน timeframe ไม่ดึงข้อมูลเศรษฐกิจของประเทศเดิมซ้ำ และไม่มี polling
- API ใหม่: `/api/v1/markets/gold/chart?timeframe=4h` รับ 5m, 15m, 30m, 1h, 4h, 1d, 1wk เท่านั้น
- API `range` แบบเก่าจะตอบ 400 เพื่อไม่ตีความผิด ลิงก์หน้าเว็บแบบเก่ายังเปิดได้โดยแปลง 1d→5m, 1w→1h, 1m/3m/1y→1d แล้วเขียน URL ใหม่ให้ชัดเจน

## การอัปเดตและ SQL สำรอง

- ราคากับกราฟยังใช้แคช 1 นาที ส่วนประเทศ/เงินเฟ้อใช้แคช 6 ชั่วโมงเมื่อมีคำขอ ไม่ใช่ timer หรือ polling
- ข้อมูลดอกเบี้ย/Headline CPI ใช้ BIS ตามเดิม ส่วน Core ใช้ตัวเชื่อมใน `backend/services/markets/core-inflation.js`
- เก็บ `core_cpi:<country>` ใน `economic_series` เดิม รวม metadata, อัตรารายเดือนย้อนหลังล่าสุดไม่เกิน 36 งวด และมาตรวัดเพิ่มเติม ไม่ต้องเปลี่ยน schema
- เมื่อไม่มี Core ของประเทศที่เปิด ระบบรอการดึงครั้งแรก หากมีข้อมูลหมดอายุแล้วจะแสดง SQL เดิมระหว่างอัปเดตเบื้องหลัง เปิด/Reload ครั้งถัดไปเพื่ออ่านผลใหม่
- การตรวจแหล่งข้อมูลรวมกันแชร์งานเดียวต่อ process; ชุดที่ยังสดจะไม่ถูกดึงซ้ำ และพักการลองใหม่อย่างน้อย 1 นาที
- แต่ละประเทศล้มเหลวแยกกันได้ ไม่ลบ snapshot ที่เคยบันทึก และไม่ทำให้ดอกเบี้ยหรือ Headline CPI หาย
- ถ้าไม่เคยมีข้อมูลจะแสดง Unavailable พร้อมชื่อ/นิยามของชุดที่พยายามดึง ไม่ใช้ศูนย์หรือค่าจำลองแทน
- วันที่งวดข้อมูลไม่ใช่เวลาที่ดึง และการดึงใหม่ไม่ได้แปลว่ามีประกาศเดือนใหม่แล้ว
- ตัวเลขที่คำนวณจากดัชนีเทียบเดือนตรงกันเท่านั้น อาจต่างจากอัตราที่สำนักสถิติประกาศเนื่องจากการปัดเศษ ดัชนีฐานต่างกันจะไม่ถูกนำมาต่อกันเอง

## ทดสอบ

จาก root รัน `npm.cmd --prefix backend run test:markets` สำหรับ parser, การคำนวณ, cache และ fallback หรือ `npm.cmd test` สำหรับชุดทดสอบทั้งหมด
ตัวเชื่อมแต่ละแหล่งตรวจรหัสประเทศ/series หน่วย ความถี่และการปรับฤดูกาลที่เกี่ยวข้อง ถ้า format เปลี่ยนจะไม่เขียนค่าที่ตรวจไม่ผ่านทับ SQL เดิม
