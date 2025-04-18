const { Builder, By, until, Capabilities } = require("selenium-webdriver")
const chrome = require("selenium-webdriver/chrome")
const url = require("url")
const fs = require("fs")
const crypto = require("crypto")
const request = require("request")
const path = require("path")
const FormData = require("form-data")
const proxy = require("selenium-webdriver/proxy")
const proxyChain = require("proxy-chain")
require('console-stamp')(console, {
  format: ':date(yyyy/mm/dd HH:MM:ss.l)'
})
require("dotenv").config()

const extensionId = "caacbgbklghmpodbdafajbgdnegacfmo"
const CRX_URL = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=98.0.4758.102&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc&nacl_arch=x86-64`
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36"

const USER = process.env.APP_USER || ""
const PASSWORD = process.env.APP_PASS || ""
const ALLOW_DEBUG = !!process.env.DEBUG?.length || false
const EXTENSION_FILENAME = "app.crx"
const PROXY = process.env.PROXY || undefined

console.log("-> Starting...")
console.log("-> User:", USER)
console.log("-> Pass:", PASSWORD)
console.log("-> Proxy:", PROXY)
console.log("-> Debug:", ALLOW_DEBUG)

if (!USER || !PASSWORD) {
  console.error("Please set APP_USER and APP_PASS env variables")
  process.exit()
}

if (ALLOW_DEBUG) {
  console.log(
    "-> Debugging is enabled! This will generate a screenshot and console logs on error!"
  )
}

async function downloadExtension(extensionId) {
  const url = CRX_URL.replace(extensionId, extensionId)
  const headers = { "User-Agent": USER_AGENT }

  console.log("-> Downloading extension from:", url)

  // if file exists and modify time is less than 1 day, skip download
  if (fs.existsSync(EXTENSION_FILENAME) && fs.statSync(EXTENSION_FILENAME).mtime > Date.now() - 86400000) {
    console.log("-> Extension already downloaded! skip download...")
    return
  }

  return new Promise((resolve, reject) => {
    request({ url, headers, encoding: null }, (error, response, body) => {
      if (error) {
        console.error("Error downloading extension:", error)
        return reject(error)
      }
      fs.writeFileSync(EXTENSION_FILENAME, body)
      if (ALLOW_DEBUG) {
        const md5 = crypto.createHash("md5").update(body).digest("hex")
        console.log("-> Extension MD5: " + md5)
      }
      resolve()
    })
  })
}

async function takeScreenshot(driver, filename) {
  // if ALLOW_DEBUG is set, taking screenshot
  if (!ALLOW_DEBUG) {
    return
  }

  const data = await driver.takeScreenshot()
  fs.writeFileSync(filename, Buffer.from(data, "base64"))
}

async function generateErrorReport(driver) {
  //write dom
  const dom = await driver.findElement(By.css("html")).getAttribute("outerHTML")
  fs.writeFileSync("error.html", dom)

  await takeScreenshot(driver, "error.png")

  const logs = await driver.manage().logs().get("browser")
  fs.writeFileSync(
    "error.log",
    logs.map((log) => `${log.level.name}: ${log.message}`).join("\n")
  )
}

async function getDriverOptions() {
  const options = new chrome.Options()

  options.addArguments("--headless")
  options.addArguments("--single-process")
  options.addArguments(`user-agent=${USER_AGENT}`)
  options.addArguments("--remote-allow-origins=*")
  options.addArguments("--disable-dev-shm-usage")
  // options.addArguments("--incognito")
  options.addArguments('enable-automation')
  options.addArguments("--window-size=1920,1080")
  options.addArguments("--start-maximized")
  options.addArguments("--disable-renderer-backgrounding")
  options.addArguments("--disable-background-timer-throttling")
  options.addArguments("--disable-backgrounding-occluded-windows")
  options.addArguments("--disable-low-res-tiling")
  options.addArguments("--disable-client-side-phishing-detection")
  options.addArguments("--disable-crash-reporter")
  options.addArguments("--disable-oopr-debug-crash-dump")
  options.addArguments("--disable-infobars")
  options.addArguments("--dns-prefetch-disable")
  options.addArguments("--disable-crash-reporter")
  options.addArguments("--disable-in-process-stack-traces")
  options.addArguments("--disable-popup-blocking")
  options.addArguments("--disable-gpu")
  options.addArguments("--disable-web-security")
  options.addArguments("--disable-default-apps")
  options.addArguments("--ignore-certificate-errors")
  options.addArguments("--ignore-ssl-errors")
  options.addArguments("--no-sandbox")
  options.addArguments("--no-crash-upload")
  options.addArguments("--no-zygote")
  options.addArguments("--no-first-run")
  options.addArguments("--no-default-browser-check")
  options.addArguments("--remote-allow-origins=*")
  options.addArguments("--allow-running-insecure-content")
  options.addArguments("--enable-unsafe-swiftshader")

  if (!ALLOW_DEBUG) {
    // options.addArguments("--blink-settings=imagesEnabled=false")
  }

  if (PROXY) {
    console.log("-> Setting up proxy...", PROXY)

    let proxyUrl = PROXY

    // if no scheme, add http://
    if (!proxyUrl.includes("://")) {
      proxyUrl = `http://${proxyUrl}`
    }

    const newProxyUrl = await proxyChain.anonymizeProxy(proxyUrl)

    console.log("-> New proxy URL:", newProxyUrl)

    options.setProxy(
      proxy.manual({
        http: newProxyUrl,
        https: newProxyUrl,
      })
    )
    const url = new URL(newProxyUrl)
    console.log("-> Proxy host:", url.hostname)
    console.log("-> Proxy port:", url.port)
    options.addArguments(`--proxy-server=socks5://${url.hostname}:${url.port}`)
    console.log("-> Setting up proxy done!")
  } else {
    console.log("-> No proxy set!")
  }

  return options
}

async function getProxyIpInfo(driver, proxyUrl) {
  // const url = "https://httpbin.org/ip"
  const url = "https://myip.ipip.net"

  console.log("-> Getting proxy IP info:", proxyUrl)

  try {
    await driver.get(url)
    await driver.wait(until.elementLocated(By.css("body")), 30000)
    const pageText = await driver.findElement(By.css("body")).getText()
    console.log("-> Proxy IP info:", pageText)
  } catch (error) {
    console.error("-> Failed to get proxy IP info:", error)
    throw new Error("Failed to get proxy IP info!")
  }
}

(async () => {
  await downloadExtension(extensionId)

  const options = await getDriverOptions()

  options.addExtensions(path.resolve(__dirname, EXTENSION_FILENAME))

  console.log(`-> Extension added! ${EXTENSION_FILENAME}`)

  // enable debug
  if (ALLOW_DEBUG) {
    options.addArguments("--enable-logging")
    options.addArguments("--v=1")
  }

  let driver
  try {
    console.log("-> Starting browser...")

    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build()

    console.log("-> Browser started!")

    if (PROXY) {
      try {
        await getProxyIpInfo(driver, PROXY)
      } catch (error) {
        throw new Error("Failed to get proxy IP info, please check the proxy by the command 'curl -vv -x ${PROXY} https://myip.ipip.net'")
      }
    }

    console.log("-> Started! Logging in https://app.gradient.network/...")
    await driver.get("https://app.gradient.network/")

    const emailInput = By.css('[placeholder="Enter Email"]')
    const passwordInput = By.css('[type="password"]')
    const loginButton = By.css("button")

    await driver.wait(until.elementLocated(emailInput), 30000)
    await driver.wait(until.elementLocated(passwordInput), 30000)
    await driver.wait(until.elementLocated(loginButton), 30000)

    await driver.findElement(emailInput).sendKeys(USER)
    await driver.findElement(passwordInput).sendKeys(PASSWORD)
    await driver.findElement(loginButton).click()

    // wait until find <a href="/dashboard/setting">
    await driver.wait(until.elementLocated(By.css('a[href="/dashboard/setting"]')), 30000)

    console.log("-> Logged in! Waiting for open extension...")

    // 截图登录状态
    takeScreenshot(driver, "logined.png")

    await driver.get(`chrome-extension://${extensionId}/popup.html`)

    console.log("-> Extension opened!")

    // 直到找到 "Status" 文本的 div 元素
    await driver.wait(
      until.elementLocated(By.xpath('//div[contains(text(), "Status")]')),
      30000
    )

    console.log("-> Extension loaded!")

    // if there is a page with a button "I got it", click it
    try {
      const gotItButton = await driver.findElement(
        By.xpath('//button[contains(text(), "I got it")]')
      )
      await gotItButton.click()
      console.log('-> "I got it" button clicked!')
    } catch (error) {
      // save rendered dom to file
      const dom = await driver
        .findElement(By.css("html"))
        .getAttribute("outerHTML")
      fs.writeFileSync("dom.html", dom)
      console.error('-> No "I got it" button found!(skip)')
    }

    // if found a div include text "Sorry, Gradient is not yet available in your region. ", then exit
    try {
      const notAvailable = await driver.findElement(
        By.xpath(
          '//*[contains(text(), "Sorry, Gradient is not yet available in your region.")]'
        )
      )
      console.log("-> Sorry, Gradient is not yet available in your region. ")
      await driver.quit()
      process.exit(1)
    } catch (error) {
      console.log("-> Gradient is available in your region. ")
    }

    // <div class="absolute mt-3 right-0 z-10">
    const supportStatus = await driver
      .findElement(By.css(".absolute.mt-3.right-0.z-10"))
      .getText()


    if (ALLOW_DEBUG) {
      const dom = await driver
        .findElement(By.css("html"))
        .getAttribute("outerHTML")
      fs.writeFileSync("dom.html", dom)
      await takeScreenshot(driver, "status.png")
    }

    console.log("-> Status:", supportStatus)

    if (supportStatus.includes("Disconnected")) {
      console.log(
        "-> Failed to connect! Please check the following: ",
      )
      console.log(`
    - Make sure the proxy is working, by 'curl -vv -x ${PROXY} https://myip.ipip.net'
    - Make sure the docker image is up to date, by 'docker pull overtrue/gradient-bot' and re-start the container.
    - The official service itself is not very stable. So it is normal to see abnormal situations. Just wait patiently and it will restart automatically.
    - If you are using a free proxy, it may be banned by the official service. Please try another static Static Residential proxy.
  `)
      await generateErrorReport(driver)
      await driver.quit()
      setTimeout(() => {
        process.exit(1)
      }, 5000)
    }

    console.log("-> Connected! Starting rolling...")

    // 截图链接状态
    takeScreenshot(driver, "connected.png")

    console.log({
      support_status: supportStatus,
    })

    console.log("-> Lunched!")

    // keep the process running
    setInterval(() => {
      driver.getTitle().then((title) => {
        console.log(`-> [${USER}] Running...`, title)
      })

      if (PROXY) {
        console.log(`-> [${USER}] Running with proxy ${PROXY}...`)
      } else {
        console.log(`-> [${USER}] Running without proxy...`)
      }
    }, 30000)
  } catch (error) {
    console.error("Error occurred:", error)
    // show error line
    console.error(error.stack)

    if (driver) {
      await generateErrorReport(driver)
      console.error("-> Error report generated!")
      console.error(fs.readFileSync("error.log").toString())
      driver.quit()
    }

    process.exit(1)
  }
})()
