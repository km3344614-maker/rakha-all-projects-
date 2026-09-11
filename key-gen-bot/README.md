# ⚡ RAKHA KEY GEN - DISCORD BOT
**By**: rakha  
**Support**: mohamed  

---

## 📋 Features:
1. **Interactive Dashboards with Buttons & Modals**:
   - **Activation / Enable Room (`1545062252359716924`)**:
     - Button `⚡ Generate License Key` -> Opens modal for:
       1. `Days` (e.g. 30, 90, 365, lifetime)
       2. `Customer Name`
       3. `User ID` (Discord User ID)
     - Sends key directly to user in DM!
     - Sends rich embed log to your Webhook!
   - **Disable Room (`1545062136311586826`)**:
     - Button `❌ Disable Key` -> Opens modal to input the key.
     - Revokes the key immediately in database.
     - DMs the user that their key has been disabled!
     - Logs action to your Webhook!
   - **Stop / Pause Room (`1545062281090564206`)**:
     - Button `⏸️ Stop / Pause Key` -> Opens modal for:
       1. Key to stop
       2. Stop duration
     - Freezes the key temporarily and DMs the user!
     - Logs action to your Webhook!

2. **Banner**:
   - All dashboards include your custom **Full Windows Optimization / RAKHA STORE** PC image!

3. **Webhook Logging**:
   - Every single generation, disable, or pause sends an embed log to:
     `https://discord.com/api/webhooks/1545060653906272306/kTZPuXrOxjA8VlKxlBzcs11lQULN4KmrB78W3Q5IEcWBmRelBpMNBkrH9gSsmrdmxXgs`

---

## 🚀 How to Run:
1. Open [`config.json`](file:///C:/Users/RAKHA/Desktop/RAKHA_DISCORD_KEY_BOT/config.json)
2. Put your Discord Bot Token in `"botToken"`.
3. Put your Bot Application ID in `"clientId"`.
4. Double-click [`start.bat`](file:///C:/Users/RAKHA/Desktop/RAKHA_DISCORD_KEY_BOT/start.bat)!
5. In Discord, type `/setup-dashboards` to post all 3 panels into the 3 channels immediately!
