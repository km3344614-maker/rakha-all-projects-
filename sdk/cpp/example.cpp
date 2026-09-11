

#include "RakhaAuth.hpp"
#include <iostream>
#include <string>

static const std::string APP_ID     = "YOUR_APP_ID";
static const std::string APP_SECRET = "YOUR_APP_SECRET";
static const std::string SERVER_URL = "https://your-server.com";
static const std::string VERSION    = "1.0.0";

static void printSep() { std::cout << std::string(50, '-') << "\n"; }
static std::string prompt(const char* label) {
    std::cout << label << ": ";
    std::string s;
    std::getline(std::cin, s);
    return s;
}

int main() {
    SetConsoleOutputCP(CP_UTF8);
    std::cout << "\n";
    printSep();
    std::cout << "  Rakha Auth SDK v2.0 — Full Demo\n";
    printSep();


    if (RakhaAuth::isDebuggerPresent()) {
        MessageBoxA(nullptr, "Debugger detected!", "Security", MB_OK | MB_ICONERROR);
        return 1;
    }


    RakhaAuth auth(APP_ID, APP_SECRET, SERVER_URL, VERSION,  true);

    std::cout << "\n[*] HWID: " << auth.getHWID() << "\n";


    std::cout << "[*] Connecting to server...\n";
    auto info = auth.init();
    if (!info.success) {
        std::cout << "[-] Error: " << info.message << "\n";
        MessageBoxA(nullptr, info.message.c_str(), "Connection Error", MB_OK | MB_ICONERROR);
        return 1;
    }
    printSep();
    std::cout << "[+] App    : " << info.name    << "\n";
    std::cout << "[+] Version: " << info.version << "\n";
    std::cout << "[+] Slug   : " << info.slug    << "\n";
    std::cout << "[+] Status : " << info.status  << "\n";
    printSep();


    std::cout << "\n  [1] Login\n";
    std::cout << "  [2] Register\n";
    std::cout << "  [3] Check License Key\n";
    std::cout << "  [4] Login with Key Only\n";
    std::cout << "\nChoice: ";
    int choice;
    std::cin >> choice;
    std::cin.ignore();
    std::cout << "\n";


    if (choice == 1) {

        auto username = prompt("Username");
        auto password = prompt("Password");

        std::cout << "\n[*] Logging in...\n";
        auto res = auth.login(username, password);

        if (res.success) {
            printSep();
            std::cout << "[+] Login Successful!\n";
            std::cout << "    User    : " << res.username    << "\n";
            std::cout << "    Tier    : " << res.tier        << "\n";
            std::cout << "    Logins  : " << res.loginCount  << "\n";
            std::cout << "    App     : " << res.appName     << " v" << res.appVersion << "\n";
            if (!res.subscriptionExpire.empty())
                std::cout << "    Expires : " << res.subscriptionExpire << "\n";
            if (auth.isSubscriptionExpired())
                std::cout << "    [!] Subscription has expired (local check)\n";
            printSep();


            if (!res.variables.empty()) {
                std::cout << "\n[*] App Variables:\n";
                for (auto& [k, v] : res.variables)
                    std::cout << "    " << k << " = " << v << "\n";
            }


            if (auth.hasTier("premium"))
                std::cout << "\n[+] Premium features unlocked!\n";
            if (auth.hasTier("lifetime"))
                std::cout << "[+] Lifetime access!\n";


            std::cout << "\n[*] Starting heartbeat (every 45s) + watchdog...\n";
            auth.startHeartbeat(45, [] {
                MessageBoxA(nullptr,
                    "Session ended (ban / expiry / tamper / network).",
                    "Session Ended", MB_OK | MB_ICONWARNING);
                ExitProcess(0);
            });

            auth.logEvent("user_logged_in", res.username);


            if (!auth.guard()) {
                std::cout << "[-] Session guard failed\n";
                return 1;
            }
            std::cout << "[+] Session guard OK — features unlocked\n";

            std::cout << "\n[*] Press ENTER to logout...\n";
            std::cin.get();
            if (!auth.guard()) ExitProcess(0);

            auth.logEvent("user_logged_out", res.username);
            auth.logout();
            std::cout << "[*] Logged out.\n";

        } else {

            std::cout << "[-] Login Failed!\n";
            std::cout << "    Code   : " << RakhaAuth::errorStr(res.error) << "\n";
            std::cout << "    Server : " << res.message << "\n";
            MessageBoxA(nullptr, res.message.c_str(), "Login Failed", MB_OK | MB_ICONERROR);
        }


    } else if (choice == 2) {

        auto username = prompt("Username");
        auto password = prompt("Password");
        auto key      = prompt("License Key");

        std::cout << "\n[*] Registering...\n";
        auto res = auth.registerUser(username, password, key);

        if (res.success) {
            printSep();
            std::cout << "[+] Registered Successfully!\n";
            std::cout << "    Tier: " << res.tier << "\n";
            std::cout << "    You can now login with your username and password.\n";
            printSep();
        } else {
            std::cout << "[-] Registration Failed!\n";
            std::cout << "    Code   : " << RakhaAuth::errorStr(res.error) << "\n";
            std::cout << "    Server : " << res.message << "\n";
        }


    } else if (choice == 3) {

        auto key = prompt("License Key");

        std::cout << "\n[*] Checking key...\n";
        auto res = auth.checkLicense(key);

        printSep();
        if (res.valid) {
            std::cout << "[+] Key is Valid!\n";
            std::cout << "    Tier    : " << res.tier     << "\n";
            std::cout << "    Status  : " << res.status   << "\n";
            std::cout << "    Duration: " << res.duration << " days"
                      << (res.duration == 0 ? " (Lifetime)" : "") << "\n";
            if (!res.expireDate.empty())
                std::cout << "    Expires : " << res.expireDate << "\n";
        } else {
            std::cout << "[-] Key Invalid!\n";
            std::cout << "    Code   : " << RakhaAuth::errorStr(res.error) << "\n";
            std::cout << "    Reason : " << res.message << "\n";
        }
        printSep();


    } else if (choice == 4) {

        auto key = prompt("License Key");

        std::cout << "\n[*] Authenticating with key...\n";
        auto res = auth.loginWithKey(key);

        if (res.success) {
            printSep();
            std::cout << "[+] Authenticated!\n";
            std::cout << "    Tier: " << res.tier << "\n";
            printSep();
            auth.logEvent("key_login", key.substr(0, 8) + "...");
        } else {
            std::cout << "[-] Auth Failed: " << res.message << "\n";
        }
    }

    std::cout << "\n";
    system("pause");
    return 0;
}
