# ChatGPT 生成圖踩坑記錄

用 Codex CLI 的 `image_gen`（ChatGPT 訂閱）生成分鏡首幀時踩過的坑與解法。
驗證方式：用「範例對照表」，同一個角色、同一個場景，每組只改一個變數，各生一張比較（`make_samples.mjs`）。共測了三組角色與場景，每組 34 張。

## 一、結論先看

| 項目 | 文字指令有沒有用 | 備註 |
|---|---|---|
| Z 景別 | **有用**（寫法要具體） | 最遠的 Z9 人物還是偏大 |
| Y 俯仰 | **有用**（寫法要具體） | Y7 很陡，但不是真正的正上方 |
| X 方位 | **有用**（要拿掉「臉要看得見」） | 角色卡沒有背面視圖也能畫出背影 |
| 焦段 | 很弱 | 14mm 的廣角變形做不出來；135mm 稍有壓縮 |
| 鏡頭品牌 | 很弱 | 只有變形寬銀幕鏡的橫向光斑看得出來 |
| 數位機身／彩色底片 | 很弱 | 幾乎分不出來 |
| 黑白底片 | **非常有效** | |
| 3D 構圖參考圖 | 小幅 | 人物大小、取景範圍會更接近；廣角變形與正上方仍做不出 |

## 二、踩坑與解法

### 1. 鏡頭指令放在提示詞中段，會被忽略

- **現象**：第一輪測試，Y1 蟲視到 Y4 平視四張幾乎一樣，Z1 大特寫和 Z2 特寫也一樣。
- **原因**：鏡頭描述夾在參考圖說明和一大段角色描述之間，被蓋過去。描述也太溫和，例如 `slightly low angle`、`extreme close-up, a single detail fills the frame`。
- **解法**：鏡頭指令放在**第一行**，標明 `CAMERA (most important, follow exactly)`，並改成具體、可以檢查的寫法：

| 代碼 | 改前 | 改後 |
|---|---|---|
| Z1 | extreme close-up, a single detail fills the frame | only the eyes and brows fill the entire frame; nothing below the nose, no shoulders, no body |
| Z5 | medium shot framed from the hips up | the frame cuts at mid-thigh, hands and hips visible, knees not visible |
| Y1 | worm's-eye view, camera on the ground looking steeply up | the camera lies on the ground and points steeply up; we see the underside of the chin and the sky or treetops behind |
| Y7 | top-down overhead shot | the camera is directly above, pointing straight down at the top of the head; the ground fills the background, no horizon |
| X5 | rear view from directly behind the subject | we see the back and the back of the head; the face is NOT visible and the subject does NOT turn toward the camera |

- **結果**：同一個角色重測，Z、Y、X 三組幾乎全部照指令出來。

### 2. 角色描述裡「臉要看得見」，會讓背面、側面鏡頭全部失敗

- **現象**：選了背面、側面，角色每一張都轉頭看鏡頭，八個方位只有正面和前 ¾ 正確。
- **原因**：角色鎖定描述寫了 `the eyes and the whole face stay visible`，參考圖說明也寫 `Keep each character's face ... exactly as in their reference`。模型為了滿足「臉要看得見」，只好讓角色轉頭。
- **解法**：方位是背面或側面時，自動拿掉角色描述中「臉／眼睛＋visible／shown／seen」這類句子。參考圖說明改成「照角色卡保持**髮型、身形、服裝（含背面）**，這顆鏡頭臉朝向別處」，並明寫 `does NOT turn toward the camera`。
- **結果**：八個方位全部正確。角色卡只有正面、沒有背面視圖的角色，背影也畫得出來。
- **經驗**：做角色卡時加上「臉要完整可見」很合理，但這句不能原封不動帶進分鏡提示詞。

### 3. 動作描述把特寫拉寬

- **現象**：Z1 大特寫只拍到肩膀以上。
- **原因**：動作寫了「自然站立、雙手垂放」，等於要求拍到身體，和大特寫互相衝突。
- **解法**：特寫、大特寫時動作只描述臉部，並加一句 `Any body, pose or costume details in the action are outside this tight frame; they must NOT widen the shot.`

### 4. 場景參考圖會壓過文字描述

- **現象**：場景描述寫了 `dry ground`，但每一張都是濕亮的反光路面。
- **原因**：場景參考圖本身就是雨夜濕街，模型照圖畫，文字壓不過參考圖。
- **解法**：直接換一張符合要求（乾燥地面）的場景圖，問題就消失了。
- **經驗**：參考圖裡有的東西，很難用文字拿掉。場景圖要先做成想要的樣子。

### 5. 鏡頭品牌、機身、焦段描述效果有限

- 寫 `shot on ARRI Alexa 35 with a Cooke S4/i 50mm lens` 這類設備名稱，成像幾乎沒差別。
- 看得出差別的只有黑白底片（Double-X）和變形寬銀幕鏡的橫向光斑。
- 焦段即使寫成具體的透視描述（例如 14mm 近距離、強烈變形），也做不出明顯的廣角變形。
- 附上 3D 方塊構圖圖：人物大小、取景範圍會更接近，但不會產生透視變形，也拍不到真正的正上方。
- **做法**：介面上註明「效果有限」，避免以為選了就有效。要特定的鏡頭質感，靠後製或換其他工具。

### 6. 「單人」沒寫進提示詞，被動作文字帶出第二個人

- **現象**：選了單人，畫面卻出現兩個人。
- **原因**：選項「單人」原本沒有對應任何文字；而動作描述是使用者手寫的句子，裡面還寫著另一個角色，被原樣送了出去。
- **解法**：單人明寫 `only <主體> is in the frame, no other people`。動作描述裡如果提到沒出場的角色，跳出警告，並提供「依選項改寫」：交給語言模型改成相符的句子，使用者確認後才套用。
- **經驗**：手寫的自由文字一定會原樣送出，選項改不到它，要另外檢查。

### 7. 角色名稱的寫法

- 中文名字直接夾在英文提示詞裡，可以運作，但不穩定。每個角色、場景另外設一個英文名。
- 英文名不要用長片語。例如「the woman in the white dress」套進所有格，會變成「the woman in the white dress's back」，用「the woman」這類短名比較好。

### 8. 並行生圖會抓錯圖

- 生圖腳本在 codex 沒直接存檔時，會改從 `~/.codex/generated_images` 抓**最新的一張**。兩張同時生成，就可能抓到另一張的圖。
- **解法**：整個工具只用一個生成佇列，一次一張。紀錄裡出現 `fallback:` 的版本自動標成「需核對」。
- **連測試也要小心**：測試用的伺服器如果接到真的生圖腳本，收到測試請求時會真的啟動 codex，和正式的生成並行。測試伺服器一律換成假的生圖腳本，專案資料夾也指向暫存資料夾。

### 9. 伺服器重啟時，生成其實還在跑

- 停掉伺服器時，背景的 codex 不會跟著停，圖照樣存了下來，但網頁已經標成「中斷」。
- **解法**：伺服器啟動時檢查圖檔是否存在，存在就補記為完成。重啟前先確認佇列沒有工作；啟動器 `run.py` 會等生成跑完才自動重啟。

### 10. 舊設定互相矛盾

- 專案質感原本寫死「Shot on 35mm motion picture film, Kodak Vision3 500T…」。後來加了機身選項，選數位機身時提示詞會同時寫「Alexa 35」和「35mm 底片」。
- **解法**：底片、顆粒、光暈交給「底片型號」產生；質感欄只寫共通要求。舊專案開啟時自動轉換一次。

### 11. 提示詞改成中文，效果差不多

- **疑問**：英文提示詞不好改，改成中文會不會變差？
- **測試**：挑最難的四個組合（Z1 大特寫、Y1 蟲視、X5 背面、Z9 大遠景），把英文版逐句翻成中文（一樣寫得具體、鏡頭放第一行），同一角色、同一場景各生一張。
- **結果**：

| 組合 | 英文版 | 中文版 |
|---|---|---|
| Z1 大特寫 | 只有眼睛和眉毛 | 幾乎一樣，多帶到一點鼻樑 |
| Y1 蟲視 | 明顯從下往上拍 | 一樣明顯，甚至更陡 |
| X5 背面 | 完整背影 | 背影正確，臉沒有轉過來 |
| Z9 大遠景 | 人約占畫面五分之一高 | 一樣大（兩版都偏大） |

- **結論**：ChatGPT 生圖看得懂中文，只要一樣寫得具體，效果相當。所以設計台加了「提示詞語言：中文」。每組只生一張，有隨機性，只能說沒看到明顯落差。
- Midjourney 對中文支援差，仍要用英文。
- 中文版也要處理「臉要看得見」：背面、側面鏡頭會拿掉「臉／眼睛／五官＋看得見／可見／清楚」這類中文句子。

## 三、時間與成本

- 一張約 1–1.5 分鐘；34 張依序生成約 45–60 分鐘。
- 用的是 ChatGPT 訂閱額度，不需要 API 金鑰，但會消耗額度。大量生成前，先用少量樣本確認提示詞有效。

## 四、Midjourney（半自動）注意事項

- Midjourney 沒有開放的官方 API，服務條款禁止自動化操作。第三方「Midjourney API」是用你的帳號自動操作，有停權風險，所以採半自動：程式組提示詞和參考圖，人工在網頁生成，再拖回來。
- Midjourney 對**短關鍵字**的反應比長句子好：鏡頭關鍵字放最前面，參數放最後（`--ar --v 7 --style raw --ow --no`）。
- 寫給 ChatGPT 的指示，例如「keep exactly the face from the reference」，在 Midjourney 只是雜訊，要拿掉；角色外觀交給 **Omni Reference**。
- Omni Reference 一次只能放一張，雙人鏡頭只能鎖定主體，另一個角色外觀容易跑掉。
- `--ow` 太高時，連角色卡的姿勢、構圖都會照抄。
- 第 3 點「特寫不寫服裝和身體描述」在 Midjourney 一樣適用。
- 以上 Midjourney 部分還沒有完整實測，用過後再補。
