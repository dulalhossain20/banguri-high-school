import os
import time
from playwright.sync_api import sync_playwright

def main():
    os.makedirs("verification_output", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 1. Test Mobile Viewport
        mobile_context = browser.new_context(
            viewport={"width": 375, "height": 812},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1"
        )
        mobile_page = mobile_context.new_page()
        mobile_page.goto("http://localhost:8080/", wait_until="networkidle")

        print("--- Testing Mobile View ---")
        footer_text = mobile_page.text_content("footer")
        print("Mobile Footer Text:", footer_text.strip() if footer_text else "None")
        assert "মোঃ দুলাল হোসেন" in footer_text, "Footer text missing on mobile"

        # Check Home empty notice board
        home_text = mobile_page.text_content("#app")
        print("Home snippet:", home_text[:120].replace("\n", " "))
        assert "বর্তমানে কোনো তথ্য প্রকাশ করা হয়নি" in home_text, "Empty state missing on Home"

        # Test Notice Board
        mobile_page.click("#nav-notices")
        mobile_page.wait_for_timeout(300)
        notices_text = mobile_page.text_content("#app")
        assert "বর্তমানে কোনো তথ্য প্রকাশ করা হয়নি" in notices_text, "Empty state missing on Notices"
        print("Notices View verified.")

        # Test Teachers
        mobile_page.click("#nav-teachers")
        mobile_page.wait_for_timeout(300)
        teachers_text = mobile_page.text_content("#app")
        assert "বর্তমানে কোনো তথ্য প্রকাশ করা হয়নি" in teachers_text, "Empty state missing on Teachers"
        print("Teachers View verified.")

        # Test Contact
        mobile_page.click("#nav-contact")
        mobile_page.wait_for_timeout(300)
        contact_text = mobile_page.text_content("#app")
        assert "Banguri High School" in contact_text, "Contact school name missing"
        assert "দেবিদ্বার, কুমিল্লা" in contact_text, "Contact location missing"
        print("Contact View verified.")

        mobile_page.screenshot(path="verification_output/mobile_home_v2.png", full_page=True)
        mobile_context.close()

        # 2. Test Desktop Viewport
        desktop_context = browser.new_context(viewport={"width": 1280, "height": 800})
        desktop_page = desktop_context.new_page()
        desktop_page.goto("http://localhost:8080/", wait_until="networkidle")

        print("--- Testing Desktop View ---")
        desktop_page.screenshot(path="verification_output/desktop_home_v2.png", full_page=True)

        # Admin Panel test
        desktop_page.click("#nav-admin")
        desktop_page.wait_for_timeout(300)
        desktop_page.fill("#pw", "banguri123")
        desktop_page.click("button:has-text('Login')")
        desktop_page.wait_for_timeout(300)

        # Click Publish tab
        desktop_page.click("button:has-text('ডেটা প্রকাশ ও ব্যাকআপ')")
        desktop_page.wait_for_timeout(300)
        desktop_page.screenshot(path="verification_output/admin_publish_v2.png", full_page=True)
        print("Admin Publish tab verified.")

        desktop_context.close()
        browser.close()

    print("=== ALL VERIFICATION TESTS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    main()
