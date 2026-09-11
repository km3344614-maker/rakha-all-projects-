#pragma once
#include "app_config.h"
#include "RakhaAuth.hpp"
#include <cstdint>
#include <mutex>
#include <string>
#include <vector>

namespace rakhaauth {

enum class Mode { Socket = 0, Http = 1 };
enum class ErrorDisplay { Silent, Console, Popup, PopupCopyDetails };

inline std::mutex& mutex_ref() { static std::mutex m; return m; }
inline RakhaAuth*& client_ref() { static RakhaAuth* c = nullptr; return c; }
inline bool& ready_ref() { static bool r = false; return r; }
inline std::string& last_error_ref() { static std::string e; return e; }
inline ErrorDisplay& display_ref() { static ErrorDisplay d = ErrorDisplay::Silent; return d; }

inline void set_error_display(ErrorDisplay d) { display_ref() = d; }

inline void show_error(const std::string& msg) {
    last_error_ref() = msg;
    if (display_ref() == ErrorDisplay::Silent) return;
#ifdef _WIN32
    if (display_ref() == ErrorDisplay::Popup || display_ref() == ErrorDisplay::PopupCopyDetails)
        MessageBoxA(nullptr, msg.c_str(), "Rakha Auth", MB_OK | MB_ICONERROR);
#endif
}

inline std::string last_error() { return last_error_ref(); }

inline bool init(const std::string& version = RAKHA_APP_VERSION, Mode = Mode::Socket) {
    std::lock_guard<std::mutex> lock(mutex_ref());
    ready_ref() = false;
    last_error_ref().clear();
    delete client_ref();
    const std::string ver = version.empty() ? RAKHA_APP_VERSION : version;
    if (std::string(RAKHA_SSL_PIN).empty()) {
        show_error("RAKHA_SSL_PIN is empty. Fill app_config.h or download a bound SDK from the panel.");
        client_ref() = nullptr;
        return false;
    }
    client_ref() = new RakhaAuth(
        RAKHA_APP_ID, RAKHA_APP_SECRET, RAKHA_SERVER, ver, true, true, RAKHA_SSL_PIN);
    auto info = client_ref()->init();
    if (!info.success) {
        show_error(info.message.empty() ? "init failed" : info.message);
        delete client_ref();
        client_ref() = nullptr;
        return false;
    }
    ready_ref() = true;
    return true;
}

inline bool ensure_ready() {
    if (ready_ref() && client_ref()) return true;
    return init();
}

inline bool license(const std::string& key, const std::string& = "") {
    if (!ensure_ready()) return false;
    std::lock_guard<std::mutex> lock(mutex_ref());
    if (!client_ref()) { show_error("init failed"); return false; }
    auto res = client_ref()->loginWithKey(key);
    if (!res.success) {
        show_error(res.message.empty() ? "license failed" : res.message);
        return false;
    }
    client_ref()->startHeartbeat(45, [] { ExitProcess(0); });
    last_error_ref().clear();
    return true;
}

inline bool login(const std::string& user, const std::string& pass) {
    if (!ensure_ready()) return false;
    std::lock_guard<std::mutex> lock(mutex_ref());
    if (!client_ref()) { show_error("init failed"); return false; }
    auto res = client_ref()->login(user, pass);
    if (!res.success) {
        show_error(res.message.empty() ? "login failed" : res.message);
        return false;
    }
    client_ref()->startHeartbeat(45, [] { ExitProcess(0); });
    last_error_ref().clear();
    return true;
}

inline bool is_authenticated() {
    return ready_ref() && client_ref() && client_ref()->isLoggedIn();
}

inline std::string username() {
    return client_ref() ? client_ref()->getUsername() : std::string();
}

inline std::vector<RakhaAuth::RemoteFile> list_files() {
    std::lock_guard<std::mutex> lock(mutex_ref());
    if (!client_ref()) return {};
    return client_ref()->listFiles();
}

inline bool download_file(const std::string& name, std::vector<uint8_t>& out) {
    std::lock_guard<std::mutex> lock(mutex_ref());
    if (!client_ref()) { show_error("not authenticated"); return false; }
    if (!client_ref()->downloadFile(name, out)) {
        show_error("download failed: " + name);
        return false;
    }
    last_error_ref().clear();
    return true;
}

// Downloads and also returns the archive password for externally hosted files.
inline bool download_file(const std::string& name, std::vector<uint8_t>& out,
                          RakhaAuth::FileGrant& grant) {
    std::lock_guard<std::mutex> lock(mutex_ref());
    if (!client_ref()) { show_error("not authenticated"); return false; }
    if (!client_ref()->downloadFile(name, out, grant)) {
        show_error("download failed: " + name);
        return false;
    }
    last_error_ref().clear();
    return true;
}

// Asks the server only for the link and password, without downloading. Use this
// when your program prefers to fetch or extract the archive itself.
inline bool get_file_link(const std::string& name, RakhaAuth::FileGrant& grant) {
    std::lock_guard<std::mutex> lock(mutex_ref());
    if (!client_ref()) { show_error("not authenticated"); return false; }
    if (!client_ref()->getFileLink(name, grant)) {
        show_error("no link for: " + name);
        return false;
    }
    last_error_ref().clear();
    return true;
}

inline bool rebind_hwid() {
    std::lock_guard<std::mutex> lock(mutex_ref());
    if (!client_ref() || !client_ref()->isLoggedIn()) {
        last_error_ref() = "not authenticated";
        return false;
    }
    auto res = client_ref()->rebindHwid();
    if (!res.success) {
        last_error_ref() = res.message.empty() ? "device bind failed" : res.message;
        return false;
    }
    last_error_ref().clear();
    return true;
}

inline void close() {
    std::lock_guard<std::mutex> lock(mutex_ref());
    if (client_ref()) {
        client_ref()->stopHeartbeat();
        delete client_ref();
        client_ref() = nullptr;
    }
    ready_ref() = false;
}

}
