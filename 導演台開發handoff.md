# 分鏡設計台（導演台）開發 handoff

給接手開發的人或 AI 助理。使用方式看 `README.md`；生圖實測經驗看 `chatgpt生成圖踩坑記錄.md`。這份寫的是**架構、設計決策與原因、開發測試方法、已知限制與下一步**。

最後更新：2026-10-26

---

## 1. 這是什麼

本機用的 AI 影片分鏡工具。流程：

```
角色卡／場景 → 用鏡頭座標（Z 景別、Y 俯仰、X 方位）＋關係、運鏡、修飾、攝影設備選鏡
→ 自動組提示詞（英文或中文；Midjourney 另有格式）→ 確認或手改
→ 送 Codex CLI 的 image_gen 生首幀（ChatGPT 訂閱）或半自動送 Midjourney
→ 網頁上比較版本、核可
→ 掛預演影片 → AI 寫 Seedance 2.5 影片提示詞 → 整理上傳包
```

另有：
- 3D 導演台：抽象代理體擺站位、算機位。
- 範例對照表：同角色同場景、一次只改一個變數的對照圖，涵蓋每一個選項（68 張），可連續點選套用，也可以用燈箱看大圖。
- 指令工具 `studio.mjs`：用計畫檔批次建立分鏡，也能做網頁上大部分的操作。
- 備註：網頁上寫給 Claude 的修改意見，Claude 在指令端處理後回覆，網頁顯示回覆（流程見 `導演台工作流.md`）。

## 2. 技術選擇與原因

| 選擇 | 原因 |
|---|---|
| 後端只用 Python 標準庫（`http.server`） | 不用安裝套件，Windows 上雙擊就能跑 |
| 前端純 JavaScript ES modules，不打包 | 改完重新整理就生效；沒有建置步驟 |
| 只綁 127.0.0.1 | 本機工具；另外有 Host／Origin 檢查（見第 6 節） |
| three.js r160 放在 `static/vendor/` | 不依賴網路 |
| 指令工具、範例腳本用 Node.js | 直接 import `static/camera.js`，提示詞和規則與網頁完全一致 |
| 生圖走 Codex CLI 的 `image_gen` | 用 ChatGPT 訂閱，不需要 API 金鑰 |

## 3. 檔案

| 檔案 | 行數約 | 內容 |
|---|---|---|
| `serve.py` | 710 | API、靜態檔（影片支援 Range）、生成佇列（單一 worker）、匯入外部成圖、依選項改寫與 Seedance 提示詞（codex 或 Claude Code，唯讀）、上傳包、重啟補記 |
| `run.py` | 110 | 啟動器：監看 `serve.py`，語法檢查後、佇列閒置時自動重啟；崩潰復原 |
| `envfile.py` | 30 | 讀 `.env`（不覆蓋已存在的環境變數） |
| `start.bat` | — | Windows 啟動（**必須純 ASCII＋CRLF**） |
| `studio.mjs` | 430 | 指令工具：new／import／list／export／gen／status／show／set／previs／seedance／notes／done／note |
| `make_samples.mjs` | 120 | 產生範例對照表專案（選項清單直接讀 `camera.js`，新增選項會自動多一張範例） |
| `tools/codex_image_gen.py` | — | 生圖腳本（`codex exec` → `image_gen`，含 fallback 抓快取） |
| `static/camera.js` | 610 | **核心**：鏡頭語言字典、攝影設備、規則檢查、提示詞組裝（英文、中文、Midjourney）、Seedance 上傳清單與脈絡 |
| `static/app.js` | 1650 | 介面（單頁）：版面與面板切換、圖示、專案、角色／場景、分鏡編輯、參考圖、生成、版本、範例對照表與燈箱、Midjourney、預演與 Seedance、備註、3D 導演台掛載 |
| `static/style.css` | — | 調光室設計（見 6b） |
| `static/stagemath.js` | 170 | 3D 幾何：代碼 ↔ 機位、片幅焦段視角、180 度線（不依賴 three.js） |
| `static/stage3d.js` | 340 | 3D 導演台畫面（three.js） |
| `docs/seedance25_guide.md` | — | 寫 Seedance 提示詞時給 AI 的守則（可用 `.env` 的 `SEEDANCE_GUIDE` 換成自己的） |
| `導演台工作流.md` | — | 網頁和指令端同時工作的流程（含備註） |

**要改提示詞或規則，只改 `static/camera.js`。** 網頁、指令工具、範例腳本都吃這一份。

## 4. 資料

```
projects/<專案>/project.json   角色、場景、分鏡、專案設定；網頁整份存回；有 _rev 版本號
projects/<專案>/gens.json      生成版本（只有後端寫入）
projects/<專案>/characters|scenes|refs|layout|frames/
```

**project.json 重點欄位**
- 專案：`ratio`（youtube／reel／square）、`lang`（zh／en，沒有就是 en）、`gear`（`{body, lens, stock}` 預設）、`look`、`rules`、`_rev`
- 角色：`{id, name, name_en, image, src?, lock, outfit, height?, color?}`（`src` 是匯入來源路徑，用來判斷要不要重新複製）
- 場景：`{id, name, name_en, image, src?, desc, set?}`（`set` 是 3D 佈景方塊）
- 分鏡：`{id, title, action, chars[], subject, scene, z, y, x, r, m, mods[], gear{focal,lens,body,stock}, manual{still|video|mj:{text,base}}, refs[], refExclude[], refOrder[], blocking, cam3d, layout, mjOw, previs?, seedance?, notes[]?, sample?}`
  - `previs`：`{path, note}`，預演影片（專案內 `previs/`）。
  - `seedance`：`{request, duration, engine: codex|claude, prompt, history[]（最多 20 筆，記首幀版本）}`。
  - `notes`：`[{id: n1…, text, created, status: open|done, by: user|claude, reply?}]`；網頁看到新回覆會亮提示。
  - `sample`：範例專案用，`[[軸, 值]]`，軸是 z／y／x／f／l／b／s（底片）／m（修飾）。

**gens.json**：`{<分鏡 id>: {current, versions: [{v, status: queued|running|done|failed, review: pending|approved|rejected|check, file, flag: fallback?, source: midjourney?, prompt, refs, code, ratio, manual, created, finished, log}]}}`

**舊資料轉換**：開專案時 `migrateGear`（app.js）會把修飾欄的舊焦段換成毫米數、把質感欄寫死的 35mm 底片句換成攝影設備預設。改資料結構時記得加轉換，不要讓舊專案壞掉。

## 5. API（serve.py）

| 方法 | 路徑 | 用途 |
|---|---|---|
| GET | `/api/projects` | 專案清單 |
| GET／POST | `/api/project?p=` | 讀／整份存專案（POST 檢查 `_rev`，不符回 409） |
| GET | `/api/project_rev?p=` | 目前版本號（網頁每 10 秒比對，外部有改就重新載入） |
| POST | `/api/projects` | 建立專案 |
| GET | `/api/gens?p=` | 生成版本 |
| POST | `/api/generate?p=` | 排入生成（參考圖必須在專案內） |
| POST | `/api/gens/set`、`/api/gens/delete`、`/api/gens/import` | 現行版／核可；刪除（檔案移到 `frames/_deleted/`）；匯入外部成圖（base64 或 https 網址） |
| GET | `/api/queue` | 佇列（含進度步驟 `step/steps/tail`） |
| GET | `/api/log?p=&path=` | 生成紀錄（只能讀 `frames/logs/`） |
| POST | `/api/upload`、`/api/import_path` | 上傳／從本機路徑或專案內路徑複製圖片與預演影片（`characters`／`scenes`／`refs`／`previs`） |
| POST | `/api/snapshot` | 存 3D 構圖截圖 |
| POST | `/api/rewrite_action` | codex 依選項改寫畫面內容 |
| POST | `/api/seedance_prompt` | 依首幀、預演、上傳清單寫 Seedance 2.5 提示詞（codex 或 Claude Code） |
| POST | `/api/seedance_pack` | 把上傳清單的檔案依編號複製成上傳包資料夾 |
| POST | `/api/reveal` | 在檔案總管選取專案內檔案（Windows） |
| GET | `/api/version` | 前端檔案最後修改時間（網頁顯示「介面已更新」） |
| GET | `/files/<專案>/…`、`/static/…` | 檔案 |

## 6. 重要設計決策（不要隨便拿掉）

1. **生成只有一個佇列、一次一張**。`codex_image_gen.py` 在 codex 沒存檔時會抓 `~/.codex/generated_images` 的最新一張；並行就會抓錯。紀錄有 `fallback:` 的版本標「需核對」。
2. **重啟補記**：停掉伺服器時 codex 還會在背景跑完；啟動時若圖檔存在就補記為完成。
3. **`_rev` 版本號**：網頁、指令工具、範例腳本都整份存 `project.json`。沒有版本號時，晚存的會把別人的修改蓋掉。
4. **Host／Origin 檢查**（`allowed()`）：只綁 127.0.0.1 擋不住使用者瀏覽器裡的惡意網頁（跨站請求、DNS rebinding）。Host 必須是 127.0.0.1／localhost；寫入類請求如果帶外站 Origin 或 `Sec-Fetch-Site: cross-site` 就拒絕。curl 和 Node 腳本不帶 Origin，所以不受影響。
5. **路徑一律檢查在專案內**（`inside()`）：`/api/log`、參考圖、`/files`、`/api/reveal`。
6. **提示詞規則是實測出來的**（見踩坑記錄）：
   - 鏡頭指令放第一行並寫具體。
   - 背面、側面時拿掉「臉要看得見」（`stripFaceVisible`，中英文都處理）。
   - 特寫加註身體細節在畫面外；單人明寫只有一人。
   - 改這些之前，先用範例對照表驗證。
7. **Midjourney 半自動**：沒有官方 API，服務條款禁止自動化，所以不做自動送出。只負責組提示詞、整理參考圖的放法，成圖由使用者拖回來。
8. **3D 代理體保持抽象**（膠囊＋球頭），避免影片模型照抄人偶動作。
9. **前端更新不需重啟**：網頁比對 `/api/version`，有新版就顯示提示條；後端更新由 `run.py` 自動重啟。
10. **伺服器由使用者啟動**：從 Claude 的工作階段啟動的伺服器，會在工作階段結束時一起被關掉。重啟前先查 `/api/queue`，有生成在跑就不要重啟；也不要替使用者按生成。
11. **範例對照表**（`make_samples.mjs`、`_範例` 專案）：
    - 基準是同一角色、同一森林場景、Z4 腰部以上、平視、右前 ¾、50mm；每張只改一個變數。微距配大特寫；時間類修飾配轉身動作；底片一律掛 Arricam 35mm 底片機身。
    - 選項清單直接讀 `camera.js` 的 `FOCALS`／`LENSES`／`BODIES`／`STOCKS`／`MODS`；預設設備（Cooke Panchro、Arricam、500T 增感）共用基準那張 F50，不重複生成。
    - 套用規則（`applySample`）：修飾可疊加、再點取消；選底片時若是數位機身，自動換成 Arricam。
    - 燈箱的按鍵掛在 `document`，不是 dialog：每次切換會重畫燈箱、焦點會不見，掛在 dialog 上左右鍵和 Esc 會失靈。

## 6b. 介面設計規範（調光室）

使用者覺得原本的深灰＋圓角卡片＋橘色強調「很 AI」，改成「調光室」：調色師工作的房間，牆面和介面都是中性灰，因為四周的顏色會影響對畫面顏色的判斷。**改介面時照這幾條：**

- **介面不放彩色**：所有灰都是 R=G=B（`--bg #474747`、`--panel #3e3e3e`、`--panel2 #343434`）。畫面裡唯一的顏色是使用者的分鏡圖。
- **狀態只用三種指示燈**（`.tally`）：綠 `ok` 核可、琥珀 `wait` 待核或生成中（生成中會慢閃）、紅 `live` 退回或失敗，灰表示還沒有。不要再加彩色標籤或彩色按鈕。
- **按鈕**：預設是淺灰實心（主要動作），`.ghost` 是細框（次要）。圓角 2px。
- **字體**：介面用思源黑體；代碼和數字（Z4、Y3、50mm、v2、S03）用 Barlow Condensed，像時間碼。
- **不用卡片外框**：區塊之間只用細線（`--line`）和明暗分隔。
- **版面**：
  - 左欄「鏡頭資料」：分鏡號、代碼、指示燈狀態、規則警告，以及切換面板的選單。
  - 右側工作區一次只顯示一個面板，預設是「畫面與版本」，其他面板上方有「回到畫面」。
  - 工作區的狀態記在 `#work` 的 `data-show` 屬性。**不能用 `data-panel`**：那是切換按鈕用的屬性，用了會讓工作區裡的每一次點擊都被當成切換面板。
- 看片區：首幀四周有安全框角標，下方一行顯示機身、鏡頭、底片。
- 3D 導演台的背景、地面、格線也是中性灰；角色代理體的顏色是資料用的，保留。

## 7. 開發與測試

**原則：測試絕不能觸發真的生圖。**真的 codex 會用掉使用者的訂閱額度，也可能和使用者正在跑的生成並行，造成抓錯圖。

- **測試伺服器**：另開埠號，環境變數把專案資料夾和生圖腳本都換掉：
  ```
  STUDIO_PROJECTS_DIR=<暫存資料夾> CODEX_IMAGE_GEN=<假腳本，只 exit 1> python serve.py --port 8799
  ```
- **介面測試**：用無頭 Edge／Chrome 加 DevTools 協定（`--remote-debugging-port`），以 `Runtime.evaluate` 操作頁面、用 `Input.dispatchMouseEvent` 模擬真實滑鼠。合成的 PointerEvent 驅動不了 three.js 的 OrbitControls；3D 要加 `--use-angle=swiftshader --enable-unsafe-swiftshader`。
- **純邏輯**：直接 `node --input-type=module -e "import … from './static/camera.js'"` 測 `buildPrompt`、`checkShot`、`solveCamera`／`nearestCodes`（代碼 → 機位 → 代碼往返）。
- **不要在使用者開著的專案上跑會存檔的介面測試**（雖然現在有 `_rev`，仍可能讓使用者的最後一筆修改被拒）。
- **改後端**：存檔後 `run.py` 會在佇列閒置時自動重啟；語法錯誤會保留舊版並印出錯誤。
- **語法檢查**：`node --check static/*.js studio.mjs`、`python -c "import ast; ast.parse(open('serve.py',encoding='utf-8').read())"`。
- 假的 codex／Claude 用 `CODEX_BIN`、`CLAUDE_BIN` 指向假執行檔（測 Seedance 提示詞、依選項改寫）。
- 測範例對照表時，把 `_範例` 整個資料夾（含 `gens.json`、`frames/`）複製到暫存資料夾。
- 鍵盤用 `Input.dispatchKeyEvent`（左右鍵、Enter、Esc），不要用合成的 KeyboardEvent。
- 目前的測試腳本都是一次性的，沒有放進儲存庫（見第 10 節）。

## 8. 慣例

- 介面文字、註解、文件一律繁體中文。
- `start.bat` 維持純 ASCII＋CRLF，`.gitattributes` 已設定；其他檔案存成 LF。
- **公開儲存庫，推送前檢查個人資料**：本機路徑、真實姓名、專案與角色名、公司信箱。個人設定放 `.env`；專案資料 `projects/`、計畫檔 `plans/`、個人腳本 `local/` 都在 `.gitignore` 裡。
- commit 作者用 GitHub 隱私信箱（只設在這個儲存庫的 local config）。
- 改提示詞寫法要附實測依據，並同步更新 `chatgpt生成圖踩坑記錄.md`。

## 9. 已知限制

| 項目 | 說明 |
|---|---|
| Z9 大遠景人物偏大 | 文字和 3D 構圖圖都只改善一點（約畫面 1/5 高，目標 1/10） |
| 攝影設備效果弱 | 鏡頭品牌、數位機身、彩色底片、焦段（18mm 也沒有廣角變形）幾乎沒差別；明顯的只有黑白底片、變形鏡的橫向光斑、微距配大特寫。介面已註明 |
| 修飾效果弱（2026-10-26 全部範例實測） | 光線類被場景參考圖的光線蓋過（側光、頂光、輪廓光、體積光幾乎沒差）；慢動作、凝結對靜態首幀沒作用，動感來自動作描述；**荷蘭角完全沒有傾斜**；框中框、負空間、移焦、全景深沒差。有效的：逆光、夕陽、大光圈虛化、幾何對稱、三分法。詳見踩坑記錄第 12 條 |
| Y7 不是真正的正上方 | 很陡，但仍帶透視 |
| Midjourney 流程未實測 | 尤其是從 Midjourney 網頁拖圖時瀏覽器給出的網址格式、V7 參數的效果 |
| 進度步驟靠讀紀錄判斷 | `job_step()` 比對 codex 輸出的文字；Codex CLI 改輸出格式就會不準（只影響顯示） |
| 整份存檔 | `_rev` 能防覆蓋，但衝突時後到的修改會被丟掉（網頁會提示重做），沒有欄位層級的合併 |
| 只支援單一使用者 | 沒有登入、權限；設計上就是本機工具 |
| 偏 Windows | `start.bat`、`/api/reveal`（explorer）、`codex.cmd` 路徑；其他系統可用 `python run.py`，但未實測 |
| 3D 導演台 | 姿勢只有幾種預設；沒有動畫或時間軸 |
| 範例對照表 | 固定讀 `_範例` 專案；只有一個角色、一個場景，換角色或場景時效果可能不同 |
| 下拉選單沒有滑過預覽 | 瀏覽器不允許在 `<option>` 上做預覽；機身、鏡頭、底片改用旁邊的放大鏡開燈箱 |

## 10. 建議的下一步

1. **把測試放進儲存庫**（`tests/`）：沙箱伺服器的啟動器加上目前一次性腳本的內容（安全檢查、指令工具、Midjourney 匯入、範例套用、語言切換、版本號）。現在每次都是重寫。
2. **荷蘭角重寫再測**：現在的「dutch angle, the horizon tilted」被忽略；改寫成具體角度（例如鏡頭往右傾 20 度、地平線明顯歪斜），用範例對照表生一張驗證。
3. **光線修飾不送場景圖再測**：重生 6 張光線範例（側光、頂光、輪廓光、體積光、逆光、夕陽）但不送場景參考圖，確認是不是場景圖鎖住光線；若是，在介面上提示「選了光線修飾時，考慮不送場景圖」。
4. **影片提示詞的實測**：首幀的寫法已驗證，Seedance 影片提示詞還沒有對照測試；時間類修飾（慢動作、凝結）應該在這裡才有作用。
5. **Midjourney 實測**後補上踩坑記錄，並修正拖曳匯入的細節。
6. **畫面內容的範本**：常見動作、表情做成可點選的片語，降低自由文字和選項衝突的機率。
7. **分鏡匯出**：目前有 Markdown 分鏡表和指令工具的 export；可以加 PDF 或圖片拼版，方便給別人看。
8. **欄位層級合併**：取代目前「衝突就重新載入」，讓網頁和指令可以同時改不同分鏡。

## 11. 相關資源（本機）

- 指令規劃流程、處理備註：全域 skill `storyboard-studio`（使用者的 Claude Code 環境）。
- 生圖通用踩坑：全域 skill `seedance25-production` 的 codex-image 段落。
- 敘事規則：使用者的「分鏡敘事準則」（不在儲存庫內）。
