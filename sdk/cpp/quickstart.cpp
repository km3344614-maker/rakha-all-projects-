#include "rakhaauth.h"

#include <iostream>
#include <string>

int main() {
    std::string license_key;
    std::cout << "License key: ";
    std::getline(std::cin, license_key);

    if (!rakhaauth::license(license_key)) {
        std::cerr << rakhaauth::last_error() << "\n";
        return 1;
    }

    for (const auto& f : rakhaauth::list_files()) {
        RakhaAuth::FileGrant grant;
        if (rakhaauth::get_file_link(f.name, grant)) {
            std::cout << f.name << " -> " << grant.url;
            if (!grant.password.empty()) std::cout << " (password received)";
            std::cout << "\n";
        }
    }

    rakhaauth::close();
    return 0;
}
