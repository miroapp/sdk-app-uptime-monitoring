const BOARD_URL = "https://miro.com/app/board/o9J_kv6RMNs=/"
const APP_KEYS = [
    "3074457347007443177", // Poker Planning
    "3074457352484427964", // Adobe XD
]

Cypress.config("defaultCommandTimeout", 60000)

const getAppIframeWindow = (appKey) => {
    return cy
        .get(`.plugins_sandbox_iframe[data-miro-app-key="${appKey}"]`)
        .its("0.contentWindow")
        .should("exist")
}

function createLoggingProxy(obj, pathPrefix, onFunctionCall) {
    return new Proxy(obj, {
        get(target, prop) {
            if (!target.hasOwnProperty(prop)) {
                return target[prop]
            }

            const value = target[prop]
            const path = pathPrefix ? `${pathPrefix}.${prop}` : prop
            if (typeof value === "function") {
                return function (...args) {
                    onFunctionCall(path, args)
                    return value.apply(this, args)
                }
            } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                return createLoggingProxy(value, path, onFunctionCall)
            }
            return target[prop]
        },
    })
}

context("Miro Apps", () => {
    before(() => {
        cy.visit(BOARD_URL)
    })

    it("logs sdk method calls", () => {
        const sdkMethodCallSequence = {}

        APP_KEYS.forEach((appKey) => {
            sdkMethodCallSequence[appKey] = []
            getAppIframeWindow(appKey).then((win) => {
                let sdk

                Object.defineProperty(win, "miro", {
                    configurable: false,
                    get: () => {
                        return sdk
                    },
                    set(originalSdk) {
                        sdk = createLoggingProxy(originalSdk, null, (methodName, args) => {
                            const iframeUrl = win.location.href

                            if (
                                methodName === "board.ui.openLibrary" ||
                                methodName === "board.openLibrary"
                            ) {
                                const modalPageUrl = new URL(
                                    methodName === "board.openLibrary" ? args[1] : args[0],
                                    iframeUrl,
                                ).toString()
                            }

                            sdkMethodCallSequence[appKey].push({
                                methodName,
                                args,
                                iframeUrl,
                            })
                        })
                    },
                })
            })
        })

        /*
        // We can check app iframe pages
        cy.intercept(
            {
                url: /^https?:\/\//,
                method: "GET",
            },
            (req) => {
                req.reply((res) => {
                    debugger
                })
            },
        )
        */

        APP_KEYS.forEach((appKey) => {
            cy.get(".AT__toolbar--LIBRARY")
                .click()
                .get(`.AT__library--${appKey}`)
                .click()
                .wait(5000)
                .should(() => {
                    const callSequence = sdkMethodCallSequence[appKey].map(
                        (call) => call.methodName,
                    )

                    cy.log(`SDK call sequence for app ${appKey}: ${callSequence.join(", ")}`)

                    assert.includeOrderedMembers(
                        callSequence,
                        ["onReady", "initialize", "isAuthorized"],
                        "first SDK calls to be miro.onReady, miro.initialize and miro.isAuthorized",
                    )

                    const uiCalls = callSequence.filter(
                        (methodName) =>
                            /^board(\.ui)\.open(Library|Modal|LeftSidebar|BottomPanel)$/,
                    )
                    assert.isNotEmpty(
                        uiCalls,
                        "one of these methods called: openLibrary, openModal, openLeftSidebar, openBottomPanel",
                    )
                })
        })
    })
})
