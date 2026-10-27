import os
import time
from playwright.sync_api import sync_playwright

def main():
    os.makedirs("verification_output", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 1. Device A (Admin Context): Log in and publish a test notice
        admin_context = browser.new_context(viewport={"width": 1280, "height": 800})
        admin_page = admin_context.new_page()

        # Handle all dialogs (alerts/confirmations) automatically
        admin_page.on("dialog", lambda dialog: dialog.accept())

        admin_page.goto("http://localhost:8080/#admin", wait_until="networkidle")

        # Fill admin login
        admin_page.fill("#pw", "banguri123")
        admin_page.click("button:has-text('Login')")
        admin_page.wait_for_timeout(300)

        # Go to Notice Board tab in admin
        admin_page.click("button:has-text('📢 নোটিশ বোর্ড')")
        admin_page.wait_for_timeout(300)

        test_title = "পরীক্ষামূলক নোটিশ - ক্রস ডিভাইস সিঙ্ক ভেরিফিকেশন"
        test_body = "এটি একটি টেস্ট নোটিশ যা অন্য ডিভাইসে রিয়েলটাইম প্রকাশের জন্য প্রদান করা হয়েছে।"

        admin_page.fill("#nt", test_title)
        admin_page.fill("#nb", test_body)

        admin_page.click("button:has-text('প্রকাশ করুন')")
        admin_page.wait_for_timeout(500)

        admin_page.screenshot(path="verification_output/admin_published_test_notice.png", full_page=True)
        print("Device A (Admin): Published test notice.")

        # 2. Device B (Fresh/Incognito Context): Open public website and verify test notice
        visitor_context = browser.new_context(
            viewport={"width": 375, "height": 812},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1"
        )
        visitor_page = visitor_context.new_page()
        visitor_page.goto("http://localhost:8080/", wait_until="networkidle")

        home_text = visitor_page.text_content("#app")
        assert test_title in home_text, "Device B (Fresh Session): Test notice title not found on homepage!"
        print("Device B (Fresh Session): Test notice verified on homepage.")

        visitor_page.click("#nav-notices")
        visitor_page.wait_for_timeout(300)
        notices_text = visitor_page.text_content("#app")
        assert test_title in notices_text, "Device B (Fresh Session): Test notice title not found on Notices page!"
        print("Device B (Fresh Session): Test notice verified on Notices page.")

        visitor_page.screenshot(path="verification_output/device_b_verified_notice.png", full_page=True)

        # 3. Clean up: Device A deletes test notice, verify Device B updates
        # Ensure admin page is still on Notices tab
        admin_page.click("button:has-text('📢 নোটিশ বোর্ড')")
        admin_page.wait_for_timeout(300)

        # Click delete button on the newly published notice
        delete_btn = admin_page.query_selector("button:has-text('মুছে ফেলুন')")
        if delete_btn:
            delete_btn.click()
            admin_page.wait_for_timeout(800)
            print("Device A (Admin): Deleted test notice.")

        # Reload on visitor page to fetch fresh server data
        visitor_page.reload(wait_until="networkidle")
        visitor_page.wait_for_timeout(500)
        updated_notices_text = visitor_page.text_content("#app")
        assert test_title not in updated_notices_text, "Test notice was not deleted on Device B!"
        print("Device B (Fresh Session): Cleaned up test notice verified.")

        # Verify default empty state message
        assert "বর্তমানে কোনো তথ্য প্রকাশ করা হয়নি" in updated_notices_text, "Default empty state message missing on Notices!"

        # Verify footer text
        footer_text = visitor_page.text_content("footer")
        assert "ব্যবস্থাপনায়: মোঃ দুলাল হোসেন" in footer_text, "Footer text incorrect!"
        print("Footer text verified.")

        admin_context.close()
        visitor_context.close()
        browser.close()

    print("=== CROSS-DEVICE SYNCHRONIZATION AND VERIFICATION SUCCESSFUL ===")

if __name__ == "__main__":
    main()
