#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include "RakhaAuth.hpp"
#include <string>
#include <map>
#include "skStr.h"

#if defined(__has_include)
#  if __has_include("app_config.h")
#    include "app_config.h"
#  endif
#endif

#ifndef XOR
#define XOR(s) skCrypt(s).decrypt()
#endif

class api {
public:
    std::string name, appid, secret, version, url, path, ssl_pin;

    struct userdata_t {
        std::string username;
        std::string ip;
        std::string hwid;
        std::string createdate;
        std::string lastlogin;
        std::string expiry;
    } user_data;

    struct responset_t {
        bool success = false;
        std::string message;
    } response;

    api(std::string name_,
        std::string appid_,
        std::string secret_,
        std::string version_,
        std::string url_,
        std::string path_ = "",
        std::string ssl_pin_ = "")
        : name(std::move(name_))
        , appid(std::move(appid_))
        , secret(std::move(secret_))
        , version(std::move(version_))
        , url(std::move(url_))
        , path(std::move(path_))
        , ssl_pin(std::move(ssl_pin_))
    {
        normalizeUrl();

        if (!looksLikeUrl(url) && looksLikeUrl(version)) {
            path = url;
            url = version;
            version = secret;
            secret.clear();
            normalizeUrl();
        }
    }

    ~api() {
        if (client_) {
            delete client_;
            client_ = nullptr;
        }
        SecureZeroMemory(secret.data(), secret.size());
        secret.clear();
    }

    void init() {
        if (!credentialsOk()) return;
        if (!ensureClient()) return;
        client_->enforceProtection();
        auto info = client_->init();
        response.success = info.success;
        response.message = info.message.empty()
            ? (info.success ? "Initialized" : "Init failed")
            : info.message;
    }

    void license(std::string key) {
        if (!credentialsOk()) return;
        if (!ensureClient()) return;
        client_->enforceProtection();
        auto res = client_->loginWithKey(key);
        applyLogin(res);
        if (response.success) {

            client_->startHeartbeat(10, [] { ExitProcess(0); });
        }
    }

    void login(std::string username, std::string password) {
        if (!credentialsOk()) return;
        if (!ensureClient()) return;
        client_->enforceProtection();
        auto res = client_->login(username, password);
        applyLogin(res);
        if (response.success) {
            client_->startHeartbeat(10, [] { ExitProcess(0); });
        }
    }

    void ban() {
        response.success = false;
        response.message = "Ban must be done from the seller panel";
    }

    bool checkblack() {
        if (!ensureClient()) return true;
        return RakhaAuth::isDebuggerPresent()
            || RakhaInternal::checkSecurity(url);
    }

    bool guard() {
        if (!client_) return false;
        if (checkblack()) { ExitProcess(0); return false; }
        return client_->guard();
    }

    std::string var(const std::string& name_) {
        if (!client_ || !guard()) return "";
        return client_->getVariable(name_);
    }

    std::string getvar(const std::string& name_) { return var(name_); }

    void log(std::string) {}

private:
    RakhaAuth* client_ = nullptr;

    static bool looksLikeUrl(const std::string& s) {
        return s.rfind("http://", 0) == 0 || s.rfind("https://", 0) == 0;
    }

    void normalizeUrl() {
        while (!url.empty() && (url.back() == '/' || url.back() == '\\'))
            url.pop_back();
    }

    bool credentialsOk() {
        if (appid.empty() || secret.empty() || url.empty() || !looksLikeUrl(url)) {
            response.success = false;
            response.message = "Missing app credentials";
            return false;
        }
        return true;
    }

    bool ensureClient() {
        if (client_) return true;
        std::string pin = ssl_pin;
#ifdef RAKHA_SSL_PIN
        if (pin.empty()) pin = std::string(RAKHA_SSL_PIN);
#endif
        if (pin.empty()) {
            response.success = false;
            response.message = "Missing certificate pin";
            return false;
        }
        client_ = new RakhaAuth(appid, secret, url, version, true, true, pin);
        SecureZeroMemory(secret.data(), secret.size());
        secret.clear();
        return true;
    }

public:
    std::vector<RakhaAuth::RemoteFile> list_files() {
        if (!ensureClient()) return {};
        return client_->listFiles();
    }

    bool get_file_link(const std::string& name, RakhaAuth::FileGrant& grant) {
        if (!ensureClient()) return false;
        return client_->getFileLink(name, grant);
    }

    bool download_file(const std::string& name, std::vector<uint8_t>& out,
                       RakhaAuth::FileGrant& grant) {
        if (!ensureClient()) return false;
        return client_->downloadFile(name, out, grant);
    }

private:
    void applyLogin(const RakhaAuth::LoginResult& res) {
        response.success = res.success;
        response.message = res.message.empty()
            ? (res.success ? "Logged in" : "Login failed")
            : res.message;
        if (!res.success) return;
        user_data.username = res.username;
        user_data.hwid = res.hwid;
        user_data.expiry = res.subscriptionExpire.empty() ? "lifetime" : res.subscriptionExpire;
        user_data.lastlogin = "";
        if (client_) {
            user_data.username = client_->getUsername().empty() ? res.username : client_->getUsername();
            user_data.hwid = client_->getHWID();
        }
    }
};
