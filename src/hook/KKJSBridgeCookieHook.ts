/// <reference path="../../types/index.d.ts" />
const noop = () => void 0;
/**
 * hook document.cookie
 */
export class _KKJSBridgeCOOKIE {
    // 静态属性和方法
    public static readonly moduleName: string = 'cookie';

    /**
     * 通过重新定义 cookie 属性来进行 cookie hook
     */
    public static setupHook: Function = () => {
        // hook cookie - document.cookie 同步到 native（WKWebView cookie 同步到 NSHTTPCookieStorage）
        try {
            const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') || Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
            if (cookieDesc && cookieDesc.configurable) {
                Object.defineProperty(document, 'cookie', {
                    configurable: false,
                    enumerable: true,
                    get: function () {
                        // 当同时开启了 ajax hook 和 cookie get hook，才需要把 document.cookie 的读取通过同步 JSBridge 调用从 NSHTTPCookieStorage 中读取 cookie。
						// 因为当非 ajax hook 情况下，说明是纯 WKWebView 的场景，那么 ajax 响应头里 Set-Cookie 只会存储在 WKCookie 里，所以此时是只能直接从 WKCookie 里读取 cookie 的。
						// if (window.KKJSBridgeConfig.ajaxHook && window.KKJSBridgeConfig.cookieGetHook) {
						// 	let cookieJson: any = window.KKJSBridge.syncCall(_KKJSBridgeCOOKIE.moduleName, 'cookie', {
						// 		"url" : window.location.href
						// 	});
						// 	return cookieJson.cookie;
						// }
                        return cookieDesc.get.call(document);
                    },
                    set: function (val) {
                        // 客户端 webview 只识别 leading dot 模式的 domain，需要把新浏览器的 RFC 6265 规范的 domain 转换成 RFC 2109 的 leading dot domain。
                        // @see https://stackoverflow.com/questions/9618217/what-does-the-dot-prefix-in-the-cookie-domain-mean#
                        val = val.replace(
                            /;\s*domain=((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9])/g,
                            (match, $1) => {
                                const normalizedDomain = $1.startsWith('.') ? $1 : `.${$1}`;
                                return `;domain=${normalizedDomain}`;
                            }
                        );
                        // @see https://developer.apple.com/documentation/foundation/nshttpcookie
                        // 种一个 cookie 必须的值
                        // NSHTTPCookiePath
                        // NSHTTPCookieName和NSHTTPCookieValue键
                        // NSHTTPCookieOriginURL键 或 NSHTTPCookieDomain键提供值
                        // 如果是当前域的，也要补上当前域的 domain，前端用 jscookie 通常都会省略这个参数，但在 ios 是必须的。
                        val = /;\s*domain\=/.test(val) ? val : val + `;domain=${location.hostname}`;
                        const fnName = `kkjsbridge_callback_${new Date().valueOf()}_${Math.floor(
                            Math.random() * 100000
                        )}`;

                        window[fnName] = () => {
                            window[fnName] = noop;
                        };

                        cookieDesc.set.call(document, val);

                        if (window.KKJSBridgeConfig.cookieSetHook) { // 如果开启 cookie set hook，则需要把 cookie 同步给 Native
							window.KKJSBridge.call(_KKJSBridgeCOOKIE.moduleName, 'setCookie', {
								"cookie" : val
							});
						}
                    }
                });
            }
        } catch (e) {
            console.log('this browser does not support reconfigure document.cookie property', e);
        }
    };

    public static ready() {
        window.KKJSBridge.call(_KKJSBridgeCOOKIE.moduleName, 'bridgeReady', {});
    }
}
