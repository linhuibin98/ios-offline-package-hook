/// <reference path="../../types/index.d.ts" />
import {KKJSBridgeUtil} from '../util/KKJSBridgeUtil';

const isAbsoluteUrl = url => {
    if (typeof url !== 'string') {
        throw new TypeError(`Expected a \`string\`, got \`${typeof url}\``);
    }

    // Don't match Windows paths `c:\`
    if (/^[a-zA-Z]:\\/.test(url)) {
        return false;
    }

    // Scheme: https://tools.ietf.org/html/rfc3986#section-3.1
    // Absolute URL: https://tools.ietf.org/html/rfc3986#section-4.3
    return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
};

/**
 * AJAX 相关方法
 */
export class _KKJSBridgeXHR {
    // 静态属性和方法
    public static readonly moduleName: string = 'ajax';
    public static globalId: number = Math.floor(Math.random() * 100000);
    public static callbackCache: Array<any> = [];

    /**
     * 生成 ajax 请求唯一id
     */
    public static generateXHRRequestId = () => {
        return String(new Date().getTime()) + _KKJSBridgeXHR.globalId++; // 时间戳 + 当前上下文唯一id，生成请求id
    };

    /**
     * 给表单生成新的 action
     */
    public static generateNewActionForForm = (form: HTMLFormElement, requestId: string) => {
        const orignAction: string = form.action;
        form.action = _KKJSBridgeXHR.generateNewUrlWithRequestId(orignAction, requestId);
    };

    /**
     * 利用 requestId 生成新的 url
     */
    public static generateNewUrlWithRequestId = (url: string, requestId: string) => {
        // 通过 a 标签来辅助拼接新的 action
        const aTag: HTMLAnchorElement = document.createElement('a');
        aTag.href = url;
        const orignAction: string = aTag.href;
        const search: string = aTag.search ? aTag.search : '';
        const hash: string = aTag.hash ? aTag.hash : '';

        if (/KKJSBridge-RequestId/.test(orignAction)) {
            // 防止重复追加 requestId
            aTag.search = aTag.search.replace(/KKJSBridge-RequestId=(\d+)/, `KKJSBridge-RequestId=${requestId}`);
        } else if (aTag.search && aTag.search.length > 0) {
            const s: string = aTag.search;
            if (/KKJSBridge-RequestId/.test(s)) {
                // 防止重复追加 requestId
                aTag.search = s.replace(/KKJSBridge-RequestId=(\d+)/, `KKJSBridge-RequestId=${requestId}`);
            } else {
                aTag.search = `${s}&KKJSBridge-RequestId=${requestId}`;
            }
        } else {
            aTag.search = `?KKJSBridge-RequestId=${requestId}`;
        }

        url = orignAction.replace(search, '').replace(hash, '');
        if ('#' === url.trim()) {
            url = '';
        }

        return url + aTag.search + aTag.hash;
    };

    /**
     * 给 open url 生成带请求 id 的新 url
     */
    public static generateNewOpenUrlWithRequestId = (url: string, requestId: string) => {
        const getOpenUrlReuestId: Function = function (requestId: string) {
            return `^^^^${requestId}^^^^`;
        };
        const openUrlReuestReg: any = /\^\^\^\^(\d+)\^\^\^\^/;
        // 通过 a 标签来辅助拼接新的 action
        const aTag: HTMLAnchorElement = document.createElement('a');
        aTag.href = url;
        const hash: string = aTag.hash ? aTag.hash : '';

        if (openUrlReuestReg.test(aTag.hash)) {
            aTag.hash = aTag.hash.replace(openUrlReuestReg, getOpenUrlReuestId(requestId));
        } else if (aTag.hash && aTag.hash.length > 0) {
            aTag.hash = aTag.hash + getOpenUrlReuestId(requestId);
        } else {
            aTag.hash = getOpenUrlReuestId(requestId);
        }

        url = url.replace(hash, '');
        if ('#' === url.trim()) {
            url = '';
        }

        return url + aTag.hash;
    };

    /**
     * 是否是非正常的 http 请求。比如 url: blob:https:// 场景下，去发送 XMLHTTPRequest，会导致请求失败
     */
    public static isNonNormalHttpRequest = (url: string, httpMethod: string) => {
        const pattern: any = /^((http|https):\/\/)/;
        return (isAbsoluteUrl(url) && !pattern.test(url)) || httpMethod === 'GET' || httpMethod === 'HEAD';
    };

    /**
     * 发送 body 到 native 侧缓存起来
     * @param xhr
     * @param originMethod
     * @param originArguments
     * @param body
     */
    public static sendBodyToNativeForCache = (
        targetType: 'AJAX' | 'FORM',
        target: XMLHttpRequest | HTMLFormElement | Navigator,
        originMethod: Function,
        originArguments: Array<any>,
        request: KK.AJAXBodyCacheRequest,
        // 前端强制异步，客户端不支持同步调用，如果依旧出现问题需要客户端处理同步调用问题。
        // requestAsync = true
    ) => {
        /*
			ajax 同步请求只支持纯文本数据，不支持 Blob 和 FormData 数据。
			如果要支持的话，必须使用 FileReaderSync 对象，但是该对象只在 workers 里可用，
			因为在主线程里进行同步 I/O 操作可能会阻塞用户界面。
			https://developer.mozilla.org/zh-CN/docs/Web/API/FileReaderSync
		*/

        const requestId: string = request.requestId;
        const cacheCallback: KK.AJAXBodyCacheCallback = {
            requestId: requestId,
            callback: () => {
                // if (targetType === "AJAX") {// ajax
                //   // 发送之前设置自定义请求头，好让 native 拦截并从缓存里获取 body
                //   target.setRequestHeader("KKJSBridge-RequestId", requestId);
                // }

                if (targetType === 'FORM' && target instanceof HTMLFormElement) {
                    // 表单 submit
                    // 发送之前修改 action，让 action 带上 requestId
                    _KKJSBridgeXHR.generateNewActionForForm(target, requestId);
                }

                // 调用原始 send 方法
                return originMethod.apply(target, originArguments);
            }
        };

        if (true) {
            // 异步请求
            // 缓存 callbcak
            _KKJSBridgeXHR.callbackCache[requestId] = cacheCallback;
            // 发送 body 请求到 native
            window.KKJSBridge.call(_KKJSBridgeXHR.moduleName, 'cacheAJAXBody', request, (message: any) => {
                // 处理 native 侧缓存完毕后的消息
                const callbackFromNative: KK.AJAXBodyCacheCallback = message;
                const requestId: string = callbackFromNative.requestId;
                // 通过请求 id，找到原始 send 方法并调用
                if (_KKJSBridgeXHR.callbackCache[requestId]) {
                    const callbackFromNative: KK.AJAXBodyCacheCallback = _KKJSBridgeXHR.callbackCache[requestId];
                    if (
                        callbackFromNative &&
                        callbackFromNative.callback &&
                        typeof callbackFromNative.callback == 'function'
                    ) {
                        callbackFromNative.callback();
                    }
                    delete _KKJSBridgeXHR.callbackCache[requestId];
                }
            });
            return;
        }

        // 同步请求
        // 发送 body 请求到 native
        window.KKJSBridge.syncCall(_KKJSBridgeXHR.moduleName, 'cacheAJAXBody', request);
        // 发送完成后继续请求原始 send 方法
        cacheCallback.callback();
    };

    /**
     * 统一处理 body 内容
     */
    public static resolveRequestBody(body?: BodyInit): Promise<Partial<KK.AJAXBodyCacheRequest>> {
        return new Promise(res => {
            if (!body) {
                res({});
            } else if (body instanceof ArrayBuffer) {
                res({
                    bodyType: 'ArrayBuffer',
                    // 说明是 ArrayBuffer，转成 base64
                    value: KKJSBridgeUtil.convertArrayBufferToBase64(body)
                });
            } else if (body instanceof Blob) {
                const bodyType: KK.AJAXBodyCacheRequest['bodyType'] = 'Blob';
                const fileReader: FileReader = new FileReader();
                fileReader.onload = function (this: FileReader, ev: ProgressEvent) {
                    // 说明是 Blob，转成 base64
                    const base64: string = (ev.target as any).result;
                    res({
                        value: base64,
                        bodyType
                    });
                };
                fileReader.readAsDataURL(body);
            } else if (body instanceof FormData) {
                // 说明是表单
                KKJSBridgeUtil.convertFormDataToJson(body, (json: string) => {
                    res({
                        bodyType: 'FormData',
                        formEnctype: 'multipart/form-data',
                        value: json
                    });
                });
            } else if (body instanceof URLSearchParams) {
                res({
                    bodyType: 'String',
                    formEnctype: 'application/x-www-form-urlencoded',
                    value: body.toString()
                });
            } else {
                // 说明是字符串或者json
                res({
                    bodyType: 'String',
                    value: body
                });
            }
        });
    }

    /**
     * 安装 AJAX Proxy
     */
    public static setupHook = () => {
        /**
         * 只 hook open/send 方法
         */
        const originOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (
            method: string,
            url: string,
            async: boolean,
            username?: string | null,
            password?: string | null
        ) {
            const args: any = [].slice.call(arguments);
            const xhr: XMLHttpRequest = this;
            // 生成唯一请求id
            xhr.requestId = _KKJSBridgeXHR.generateXHRRequestId();
            xhr.requestUrl = url;
            xhr.requestHref = document.location.href;
            xhr.requestMethod = method;
            xhr.requestAsync = async;

            if (_KKJSBridgeXHR.isNonNormalHttpRequest(url, method)) {
                // 如果是非正常请求，则调用原始 open
                return originOpen.apply(xhr, args);
            }

            if (!window.KKJSBridgeConfig.ajaxHook) {
                // 如果没有开启 ajax hook，则调用原始 open
                return originOpen.apply(xhr, args);
            }

            // 生成新的 url
            args[1] = _KKJSBridgeXHR.generateNewUrlWithRequestId(url, xhr.requestId);
            originOpen.apply(xhr, args);
        } as any;

        const originSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (
            body?:
                | string
                | Document
                | Blob
                | ArrayBufferView
                | ArrayBuffer
                | FormData
                | URLSearchParams
                | ReadableStream<Uint8Array>
        ) {
            const args: any = [].slice.call(arguments);
            const xhr: XMLHttpRequest = this;
            const requestRaw: KK.AJAXBodyCacheRequest = {
                requestId: xhr.requestId,
                requestHref: xhr.requestHref,
                requestUrl: xhr.requestUrl,
                bodyType: 'String',
                value: null
            };

            if (_KKJSBridgeXHR.isNonNormalHttpRequest(xhr.requestUrl, xhr.requestMethod)) {
                // 如果是非正常请求，则调用原始 send
                return originSend.apply(xhr, args);
            }

            if (!window.KKJSBridgeConfig.ajaxHook) {
                // 如果没有开启 ajax hook，则调用原始 send
                return originSend.apply(xhr, args);
            }

            if (!body || body instanceof Document) {
                // 没有 body 或 body 是 Document，调用原始 send
                return originSend.apply(xhr, args);
            } else {
                _KKJSBridgeXHR.resolveRequestBody(body).then(req => {
                    const request = {
                        ...requestRaw,
                        ...req
                    };

                    _KKJSBridgeXHR.sendBodyToNativeForCache('AJAX', xhr, originSend, args, request);
                });
            }
        };

        /**
         * hook form submit 方法
         */
        const originSubmit = HTMLFormElement.prototype.submit;
        HTMLFormElement.prototype.submit = function () {
            const args: any = [].slice.call(arguments);
            const form: HTMLFormElement = this;
            form.requestId = _KKJSBridgeXHR.generateXHRRequestId();
            form.requestUrl = form.action;
            form.requestHref = document.location.href;

            const request: KK.AJAXBodyCacheRequest = {
                requestId: form.requestId,
                requestHref: form.requestHref,
                requestUrl: form.requestUrl,
                bodyType: 'FormData',
                formEnctype: form.enctype,
                value: null
            };

            if (!window.KKJSBridgeConfig.ajaxHook) {
                // 如果没有开启 ajax hook，则调用原始 submit
                return originSubmit.apply(form, args);
            }

            const action: string = form.action;
            if (!action) {
                // 如果 action 本身是空，则调用原始 submit
                return originSubmit.apply(form, args);
            }

            const formData: any = new FormData(form);
            KKJSBridgeUtil.convertFormDataToJson(formData, (json: any) => {
                request.value = json;
                _KKJSBridgeXHR.sendBodyToNativeForCache('FORM', form, originSubmit, args, request);
            });
        };
    };
}
