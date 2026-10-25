# 13soul 分鏡設計台（Storyboard Studio）

在本機瀏覽器裡設計 AI 影片分鏡的工具：上傳角色卡與場景 → 用 X／Y／Z 鏡頭座標、攝影設備選鏡 → 自動組出提示詞 → 確認或手改 → 呼叫 Codex（ChatGPT 訂閱）生成首幀 → 在網頁上比較版本、核可。

A local, browser-based storyboard tool for AI video: pick shots with X/Y/Z camera coordinates and camera gear, get a generated prompt, review it, and render first frames through the Codex CLI. The UI is in Traditional Chinese.

- 後端只用 Python 標準庫，前端是純 JavaScript，**不需要 `pip install` 或 `npm install`**。
- 只綁 `127.0.0.1`，不對外開放。
- 你的專案資料（角色卡、場景、生成的圖）都存在本機 `projects/`，不會進版本控制。

## 需求

| 項目 | 用途 |
|---|---|
| Python 3.10 以上 | 後端 `serve.py` |
| Node.js 18 以上 | 安裝 Codex CLI 要用 npm；產生範例對照表需要 20.6 以上 |
| [Codex CLI](https://github.com/openai/codex)，並用 ChatGPT 帳號登入 | 生圖、依選項改寫畫面內容（用 ChatGPT 訂閱額度，不需要 API 金鑰） |
| Windows（`start.bat`） | macOS／Linux 直接執行 `python run.py` 也可以 |

## 安裝

1. **安裝 Python**：到 [python.org](https://www.python.org/downloads/) 下載 3.10 以上版本。Windows 安裝時要勾選「Add python.exe to PATH」。
   確認：開命令提示字元輸入 `python --version`，看到 3.10 以上即可。
2. **安裝 Node.js**：到 [nodejs.org](https://nodejs.org/) 下載 LTS 版本。
   確認：`node --version`。
3. **安裝並登入 Codex CLI**：
   ```
   npm install -g @openai/codex
   codex login
   ```
   登入時選「Sign in with ChatGPT」，用有 ChatGPT 訂閱的帳號。確認：`codex login status` 要顯示 `Logged in using ChatGPT`。
4. **下載本專案**（二選一）：
   - 有裝 git：
     ```
     git clone https://github.com/chenisan/13soul-storyboard-studio.git
     cd 13soul-storyboard-studio
     ```
   - 沒有 git：在 GitHub 頁面按「Code」→「Download ZIP」，解壓縮到任意資料夾。
5. **建立設定檔**：把 `.env.example` 複製一份，改名為 `.env`。全部留空也能跑；要改埠號、資料位置或範例角色時再編輯，說明見下方「設定」。
6. **啟動**：Windows 雙擊 `start.bat`；macOS／Linux 執行 `python run.py`。
   瀏覽器會打開（或自己開）`http://127.0.0.1:8790/`，看到「分鏡設計台」頁面就成功了。
7. **試一次生圖**：按「＋專案」建立專案 → 右上角「角色卡／場景」上傳一張角色圖 → 下方「＋」新增分鏡、勾選角色、選景別 Z 與俯仰 Y → 按「生成首幀…」→「確認生成」。約 1–2 分鐘後圖片會出現在頁面上。

不需要 `pip install` 或 `npm install` 本專案的任何套件。

### Codex 設定（生圖的關鍵）

**需要什麼**
- **ChatGPT 付費方案**（Plus、Pro、Team 等）。生圖用的是 ChatGPT 訂閱額度，不是 OpenAI API：不需要 API 金鑰，也不會產生 API 帳單，但會用掉訂閱的生圖額度。大量生成時可能遇到忙碌或額度限制。
- **新版 Codex CLI**。生圖用的是 Codex 內建的 `image_gen` 工具，舊版可能沒有。已經裝過的話先更新：
  ```
  npm install -g @openai/codex@latest
  codex login status      # 要看到 Logged in using ChatGPT
  ```

**運作方式**（不用另外設定）
1. 本專案附了 `tools/codex_image_gen.py`；`.env` 的 `CODEX_IMAGE_GEN` 留空就用它。
2. 按生成時，它用 `codex exec` 在背景開一個 Codex 工作階段，請它用 `image_gen` 依提示詞生圖；參考圖會一起交給它。
3. 產生的圖存到專案的 `frames/`。如果 Codex 沒把圖存到指定位置，腳本會從 `~/.codex/generated_images` 抓最新一張補上，並在紀錄裡標 `fallback:`。
   因為這個機制，**兩張同時生成會抓錯圖**。設計台用單一佇列一次只跑一張；不要另外同時跑其他 Codex 生圖。
4. 「依選項改寫」也用同一個 Codex 登入，以唯讀模式在暫存資料夾執行。

**先單獨測一次**：在本資料夾執行下面的指令，1–2 分鐘後 `test_output/` 出現圖片，就表示 Codex 這端正常。

```
python tools/codex_image_gen.py "a red apple on a wooden table" --out test_output
```

**用自己的生圖腳本**：在 `.env` 設 `CODEX_IMAGE_GEN=腳本路徑`。參數格式要和附的腳本相同：`"<提示詞>" --ratio square|reel|youtube --out <資料夾> --filename <檔名> --ref <參考圖>…`。

### 常見問題

| 狀況 | 處理 |
|---|---|
| 網頁打不開、連不到 | 確認 `start.bat` 開出的最小化視窗還在；或在本資料夾執行 `python run.py` 看錯誤訊息 |
| 生成失敗，紀錄寫 `No authentication found` | Codex 沒登入，重新執行 `codex login` |
| 生成失敗，紀錄寫 `Selected model is at capacity` | ChatGPT 忙碌，稍後再按一次生成 |
| 生成失敗，紀錄裡沒有用到 `image_gen` | Codex 版本太舊，執行 `npm install -g @openai/codex@latest` |
| Windows 找不到 `codex` 指令 | 確認 npm 的全域資料夾（通常是 `%APPDATA%\npm`）在 PATH 裡；腳本會自動找 `codex.cmd` |
| 生成很慢 | 正常，一張約 1–1.5 分鐘；多張會依序排隊 |
| 圖和這顆分鏡對不上 | 紀錄出現 `fallback:` 的版本會標「需核對」，通常是同時有別的 Codex 在生圖 |
| 埠號 8790 被占用 | 在 `.env` 改 `STUDIO_PORT`，例如 `8791` |
| 改了 `.env` 沒生效 | 關掉伺服器視窗再重新啟動 |

## 設定

1. 複製 `.env.example`，改名為 `.env`。
2. 依自己的電腦修改裡面的值；每個欄位的說明都寫在 `.env.example` 裡。全部留空也能跑，會用預設值。

| 設定 | 預設 | 說明 |
|---|---|---|
| `STUDIO_PORT` | `8790` | 網頁服務的埠號 |
| `STUDIO_PROJECTS_DIR` | `projects/` | 專案資料存放位置 |
| `CODEX_IMAGE_GEN` | `tools/codex_image_gen.py` | 生圖腳本；可以指到你自己的版本 |
| `SAMPLE_*` | （空） | 範例對照表用的角色卡與場景，見下方「範例對照表」 |

`.env` 已列在 `.gitignore`，不會被提交。

## 啟動

- **Windows**：雙擊 `start.bat`。服務沒在跑就啟動並自動開網頁，已在跑就只開網頁。伺服器會在一個最小化視窗裡執行，關掉那個視窗就停止服務。
  - 想要快速鍵：對 `start.bat` 建立桌面捷徑，在捷徑「內容」裡設定快速鍵（例如 Ctrl+Alt+S）。
- **其他系統**：`python run.py`，再開 `http://127.0.0.1:8790/`。

`run.py` 是啟動器：

- 它會在 `serve.py` 被修改時自動重啟：先檢查語法，有錯就繼續跑舊版；有生成在排隊或進行中，就等跑完再重啟。
- 伺服器意外結束時，它會自動重新啟動。
- `run.py` 一結束，伺服器也跟著結束。

只改 `static/` 前端不需要重啟，網頁頂端會出現「介面已更新」提示，按一下重新整理即可。

> `start.bat` 必須維持純英文＋CRLF 換行；cmd 讀到 UTF-8 中文註解或 LF 換行會解析錯誤。

## 使用流程

1. 頁首「＋專案」建立專案，「專案設定」選畫幅、攝影設備預設、共通質感與禁止事項。
2. 右上角「角色卡／場景」上傳角色卡與場景圖（可以拖曳），按「編輯」填名稱、英文名、鎖定描述。
3. 下方分鏡列按「＋」新增分鏡：勾出場角色、指定主體、選場景，寫畫面內容。
4. 用鏡頭座標、人物關係、運鏡、修飾、攝影設備選鏡；不合理的組合會出現警告，多數附一鍵修正。
5. 按「生成首幀…」，確認或修改提示詞後送出，生成依序排隊；完成後直接顯示在頁面上，可以核可、退回、刪除或拿那版的提示詞再改。

## 鏡頭座標

| 軸 | 內容 |
|---|---|
| Z 景別 | Z1 大特寫、Z2 特寫、Z3 近景、Z4 中近景、Z5 中景、Z6 四分之三身景、Z7 全景、Z8 遠景、Z9 大遠景 |
| Y 俯仰 | Y1 蟲視、Y2 仰視、Y3 輕微仰視、Y4 平視、Y5 輕微俯視、Y6 俯視、Y7 垂直頂視 |
| X 方位 | 以主體臉部朝向為 0°，從上方看順時鐘每 45° 一格：X1 正面、X2 右前¾、X3 右側、X4 右後¾、X5 背面、X6 左後¾、X7 左側、X8 左前¾ |
| 關係 | 單人、雙人同框、過肩、主觀、前景遮擋（單人會明確寫「畫面中只有主體」） |
| 運鏡 | 只寫進影片提示詞（首幀是靜態） |
| 修飾 | 光線、景深、時間、構圖 |
| 攝影設備 | 機身（Alexa 35／65、Venice 2、V-Raptor、DXL2、35mm／IMAX／16mm 底片）、鏡頭（Cooke、Zeiss、Canon K35、Leica、Panavision 變形、Helios 44…）、焦段 14–135mm、底片型號 |

代碼、英文描述、相容規則與提示詞組裝都在 `static/camera.js`，要調整就改這一份。

- 攝影設備可以在「專案設定」設預設，每顆分鏡再個別覆蓋。
- 提示詞會同時寫設備名稱和光學特徵；3D 導演台依「片幅＋焦段」計算視角。

## 指令工具（先用指令出主要分鏡，再到網頁細修）

`studio.mjs` 可以用指令建立專案、匯入整份分鏡計畫、檢查、送生成。提示詞和規則檢查用的是網頁同一份程式，結果一致。需要服務正在執行。

```
node studio.mjs new <專案> [--ratio youtube|reel|square] [--lang zh|en]
node studio.mjs import <計畫檔.json> [--replace] [--dry-run]
node studio.mjs list <專案>
node studio.mjs export <專案> [輸出檔.json]
node studio.mjs gen <專案> <S01,S02|all> [--missing] [--yes]
node studio.mjs status
```

- **分鏡計畫檔**：JSON，寫專案、角色（名稱、角色卡圖片、鎖定描述）、場景、每顆分鏡（景別 z、俯仰 y、方位 x、關係 r、運鏡 m、修飾、焦段、畫面內容）。範例見 `examples/plan_example.json`。角色、場景、修飾、鏡頭都可以用名稱寫，例如修飾寫「輪廓光」。圖片路徑以計畫檔所在資料夾為準。
- **import**：
  - 先檢查整份，有任何錯誤（代碼寫錯、角色名稱對不上、圖片不存在…）就整份不匯入，並列出所有問題。`--dry-run` 只檢查。
  - 同名角色、場景沿用，同一張來源圖不重複複製。
  - 分鏡預設加在後面，`--replace` 整份取代；分鏡寫了 `id` 就更新那一顆。
  - 新分鏡的代號會接在用過的最大號碼後面，不會和舊版本的圖混在一起。
- **export → 修改 → import --replace**：用指令大改既有專案。
- **gen**：沒加 `--yes` 只列出會生成哪些、需要多久，不會送出。`--missing` 只生還沒有圖的。有紅色錯誤的分鏡會略過。網頁上手改過的提示詞優先使用。
- 網頁開著同一個專案時，匯入後 10 秒內會自動重新載入。專案存檔有版本號，網頁和指令同時修改時，後到的會被拒絕，不會互相覆蓋。

搭配 AI 助理使用時：把劇情交給它拆成計畫檔，`import --dry-run` 檢查，匯入後在網頁看過，確認再 `gen … --yes`。

## 提示詞語言（中文／英文）

「專案設定」可以選提示詞語言。選中文後：

- 首幀和影片提示詞全部用中文產生，包括鏡頭指令、參考圖說明、單人／背面／特寫的配套句子、底片與質感、禁止事項，可以直接看懂、直接改。
- 角色鎖定描述、場景描述、畫面內容這些自己填的欄位，直接用中文寫。
- 機身、鏡頭、底片型號這類名稱保留原文（Arricam、Kodak Vision3…）。
- Midjourney 分頁一律英文（Midjourney 對中文支援差）。
- 切換語言時，質感與禁止事項如果還是預設文字，會換成該語言的預設；自己改過的不動。

實測：同一組最難的鏡頭（大特寫、蟲視、背面、大遠景），逐句對應的中文版和英文版效果相當，見踩坑記錄。

## Midjourney（半自動）

Midjourney 沒有開放的官方 API，服務條款也禁止自動化操作，所以這裡採半自動：程式組好提示詞、整理參考圖，你在 Midjourney 網頁生成，再把成圖拖回來。

1. 提示詞區切到「Midjourney」分頁。
   - 提示詞會照 Midjourney 的習慣寫：短關鍵字、鏡頭放最前面。
   - 自動加上 `--ar`（依專案畫幅）、`--v 7`、`--style raw`、`--ow`、`--no`。
   - 按「複製」貼到 Midjourney。
2. 下方列出每張參考圖該放的位置：主體角色卡放 **Omni Reference**（鎖定外觀，一次只能一張），場景和其他圖放 **Image Prompt**。
   - 「複製圖片」後到 Midjourney 按 Ctrl+V 貼上，或「在資料夾顯示」後直接拖過去。
   - Omni 權重 `--ow` 可以用滑桿調整：越高越像角色卡，太高會連姿勢、構圖都照抄。
3. 生成後，把成圖從 Midjourney 網頁直接拖到「匯入區」，或拖下載好的檔案。成圖會成為這顆分鏡的新版本（標記 MJ），一樣可以比較、核可、刪除。
   - 拖網頁圖片時，程式會下載該 https 網址；只接受 png／jpg／webp，30MB 以內。

雙人鏡頭時，只有主體能用 Omni Reference 鎖定，另一個角色只能靠文字描述，外觀容易跑掉。

## 畫面內容與依選項改寫

「畫面內容」是你自己寫的句子，會原樣放進提示詞的 `Action:`，選項不會自動改它。

- 句子裡提到沒出場的角色時會警告。
- 按「依選項改寫」，會把出場角色、人物關係、鏡頭交給 Codex，改寫成相符的句子（唯讀沙盒、在空的暫存資料夾執行）。結果先給你看，按「套用」才會換掉原文。

## 參考圖

提示詞上方那排縮圖，就是送給 Codex 的參考圖，順序即「圖片1、2、3…」。

- 綁定的角色卡與場景會自動帶入。縮圖的「✕」只讓這顆鏡頭不送那張圖（角色仍算出場），變灰後按「↺」恢復。
- 「＋ 加入」：可以上傳或拖曳新圖、貼本機路徑、挑其他鏡頭的成圖（連戲用），或挑專案的角色卡、場景。每張可以填用途，會寫進提示詞。
- 拖曳縮圖可以調整順序。

## 3D 導演台

「鏡頭座標」卡片切到「3D 導演台」：

- **鏡頭視角**：依代碼自動算機位。拖曳轉鏡頭、滾輪推拉、右鍵平移，左上會顯示目前「約等於」哪組代碼，可以「套用成代碼」或「保留這個機位」。
- **導演視角**：
  - 拖曳角色與佈景方塊，調整面向、姿勢、離地高度。
  - 黃色虛線是兩人之間的 180 度線，紅色視錐是這顆鏡頭，藍色是同場景其他鏡頭。
- 人物只用膠囊＋球頭的抽象代理體，避免生成模型照抄人偶。
- 「拍下構圖」或生成時勾「附上 3D 構圖參考圖」，會截一張方塊構圖放在參考圖最後一張。
- three.js r160 已附在 `static/vendor/`（MIT 授權），不需要網路。
- 網址參數：`?shot=S02&view=3d&mode=director`。

## 範例對照表

用同一個角色、同一個場景，每組只改一個變數，生成約 34 張對照圖：景別、俯仰、方位、焦段、鏡頭、機身／底片。生成後：

- 滑鼠停在選項上，會跳出該選項的範例圖。
- 頁首「範例對照表」可以一次比較整組。

1. 在 `.env` 填 `SAMPLE_CHARACTER_*` 與 `SAMPLE_SCENE_*`（角色卡、場景圖路徑與名稱）。
2. 先開好服務，再執行：

```
node make_samples.mjs          # 只建立「_範例」專案，不生成
node make_samples.mjs z,y,x    # 生成景別、俯仰、方位三組
node make_samples.mjs all      # 全部（約 34 張，依序生成，約 45–60 分鐘）
```

名稱以「_」開頭的專案視為參考用，排在專案選單最後，也不做相鄰鏡頭檢查。

## 資料

```
projects/<專案>/project.json   角色、場景、分鏡、專案設定（網頁整份存回）
projects/<專案>/gens.json      每顆分鏡的生成版本、現行版、核可狀態（後端寫）
projects/<專案>/characters/    角色卡（上傳或匯入時複製進來，原檔不動；同名自動加 _v2）
projects/<專案>/scenes/        場景圖
projects/<專案>/refs/          額外參考圖
projects/<專案>/layout/        3D 構圖截圖
projects/<專案>/frames/        生成的首幀 S01_v1.png …；logs/ 是每次生成的完整輸出；_deleted/ 是刪除的版本
```

- 生成一次只跑一張（單一佇列），避免 Codex 並行時抓錯圖。紀錄出現 `fallback:` 的版本會標成「需核對」。
- 網頁每次存檔都是整份專案寫回去，同一個專案請只開一個分頁編輯。

## 踩坑記錄

實測整理的生圖經驗（哪些鏡頭指令有效、角色描述怎麼寫、Midjourney 注意事項）見 [chatgpt生成圖踩坑記錄.md](chatgpt生成圖踩坑記錄.md)。

## 檔案

| 檔案 | 說明 |
|---|---|
| `serve.py` | 後端：API、生成佇列、依選項改寫 |
| `run.py` | 啟動器：自動重啟、崩潰復原 |
| `envfile.py` | 讀 `.env` |
| `start.bat` | Windows 啟動捷徑用 |
| `tools/codex_image_gen.py` | 生圖腳本：透過 Codex CLI 的 image_gen 生圖，支援參考圖 |
| `make_samples.mjs` | 產生範例對照表 |
| `studio.mjs` | 指令工具：匯入分鏡計畫、檢查、送生成 |
| `examples/plan_example.json` | 分鏡計畫檔範例 |
| `static/` | 前端：`app.js` 介面、`camera.js` 鏡頭語言與提示詞、`stagemath.js`／`stage3d.js` 3D 導演台 |
