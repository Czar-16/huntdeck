"""Optional Selenium/geckodriver smoke check; run package:firefox first."""
import json
import os
import shutil
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text())
(root / 'test-results').mkdir(exist_ok=True)
options = webdriver.FirefoxOptions()
options.add_argument('-headless')
if os.environ.get('FIREFOX_BINARY'):
    options.binary_location = os.environ['FIREFOX_BINARY']
options.set_preference('extensions.webextensions.uuids', json.dumps({'huntdeck@czar16': 'ba9782d8-5edb-41dc-a540-75a971de51cb'}))
service_args = ['--allow-system-access']
if os.environ.get('FIREFOX_PROFILE_ROOT'):
    service_args += ['--profile-root', os.environ['FIREFOX_PROFILE_ROOT']]
service = Service(os.environ.get('GECKODRIVER') or shutil.which('geckodriver'), service_args=service_args)
driver = webdriver.Firefox(options=options, service=service)
try:
    driver.install_web_extension(str(root / 'dist' / f"huntdeck-{manifest['version']}-firefox.zip"), permanent=False)
    driver.set_context('chrome')
    driver.execute_script("const w = Services.wm.getMostRecentWindow('navigator:browser'); w.gBrowser.selectedTab = w.gBrowser.addTab(arguments[0], {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});", 'moz-extension://ba9782d8-5edb-41dc-a540-75a971de51cb/popup.html')
    driver.set_context('content')
    driver.switch_to.window(driver.window_handles[-1])
    wait = WebDriverWait(driver, 20)
    wait.until(lambda d: d.find_element(By.ID, 'total').text == '0')
    driver.find_element(By.ID, 'apply-button').click()
    wait.until(lambda d: d.find_element(By.ID, 'message').text == 'Saved. Keep going!')
    wait.until(lambda d: d.find_element(By.ID, 'apply-button').is_enabled())
    assert driver.find_element(By.ID, 'total').text == '1'
    driver.refresh()
    wait.until(lambda d: d.find_element(By.ID, 'total').text == '1')
    driver.find_element(By.ID, 'theme-button').click()
    driver.find_element(By.CSS_SELECTOR, '[data-appearance="amoled-red"]').click()
    wait.until(lambda d: d.find_element(By.ID, 'apply-button').is_enabled())
    wait.until(lambda d: d.execute_script('return getComputedStyle(document.getElementById("apply-button")).backgroundColor') == 'rgb(255, 51, 51)')
    driver.find_element(By.TAG_NAME, 'body').send_keys('\ue00c')
    driver.find_element(By.ID, 'settings-button').click()
    assert 'Alt+J' in driver.find_element(By.ID, 'shortcut-assignment').text
    driver.find_element(By.CSS_SELECTOR, '#feature-toggles > button').click()
    assert 'about:addons' in driver.find_element(By.ID, 'message').text
    driver.find_element(By.ID, 'feature-notes').click()
    wait.until(lambda d: d.find_element(By.ID, 'daily-goal').is_enabled())
    driver.find_element(By.ID, 'back-button').click()
    driver.find_element(By.ID, 'apply-button').click()
    wait.until(lambda d: d.find_element(By.ID, 'apply-button').is_enabled())
    driver.find_element(By.CSS_SELECTOR, '#quick-note-form input[name="company"]').send_keys('Firefox Company')
    driver.find_element(By.CSS_SELECTOR, '#quick-note-form input[name="role"]').send_keys('Engineer')
    driver.find_element(By.CSS_SELECTOR, '#quick-note-form button').click()
    wait.until(lambda d: d.find_element(By.ID, 'message').text == 'Note saved.')
    driver.find_element(By.ID, 'history-button').click()
    assert len(driver.find_elements(By.CLASS_NAME, 'history-entry')) == 1
    driver.find_element(By.CSS_SELECTOR, '.history-entry summary').click()
    assert driver.find_element(By.CSS_SELECTOR, '.history-entry input[name="company"]').get_attribute('value') == 'Firefox Company'
    driver.save_screenshot(str(root / 'test-results/firefox-history.png'))
    print('Firefox smoke passed: install, background messaging, saved counts/reload, AMOLED red, actual shortcut, configuration instructions, notes and compact History.')
finally:
    driver.quit()
