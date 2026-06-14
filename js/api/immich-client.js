(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};

    function ImmichError(code, message, details) {
        this.name = 'ImmichError';
        this.code = code;
        this.message = message;
        this.details = details || null;
    }

    ImmichError.prototype = Object.create(Error.prototype);
    ImmichError.prototype.constructor = ImmichError;

    function ImmichClient(options) {
        this.serverUrl = normalizeServerUrl(options.serverUrl || '');
        this.accessToken = options.accessToken || '';
        this.apiKey = options.apiKey || '';
        this.authMode = options.authMode || 'password';
        this.timeoutMs = options.timeoutMs || 12000;
    }

    ImmichClient.prototype.pingServer = function () {
        return this.request('/server/ping');
    };

    ImmichClient.prototype.getServerVersion = function () {
        return this.request('/server/version');
    };

    ImmichClient.prototype.login = function (credentials) {
        return this.request('/auth/login', {
            method: 'POST',
            body: {
                email: credentials.email,
                password: credentials.password
            },
            auth: false
        });
    };

    ImmichClient.prototype.logout = function () {
        return this.request('/auth/logout', {
            method: 'POST'
        });
    };

    ImmichClient.prototype.validateToken = function () {
        return this.request('/auth/validateToken', {
            method: 'POST'
        });
    };

    ImmichClient.prototype.getAuthStatus = function () {
        return this.request('/auth/status');
    };

    ImmichClient.prototype.getMyUser = function () {
        return this.request('/users/me');
    };

    ImmichClient.prototype.request = function (path, options) {
        var requestOptions = options || {};
        var method = requestOptions.method || 'GET';
        var headers = Object.assign({}, requestOptions.headers || {});
        var shouldAuth = requestOptions.auth !== false;
        var url = this.url(path);
        var fetchOptions = {
            method: method,
            headers: headers
        };

        if (requestOptions.body !== undefined) {
            headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(requestOptions.body);
        }

        if (shouldAuth) {
            if (this.authMode === 'apiKey' && this.apiKey) {
                headers['x-api-key'] = this.apiKey;
            } else if (this.accessToken) {
                headers.Authorization = 'Bearer ' + this.accessToken;
            }
        }

        return fetchWithTimeout(url, fetchOptions, this.timeoutMs).then(function (response) {
            return parseResponse(response).then(function (payload) {
                if (!response.ok) {
                    throw createHttpError(response, payload);
                }

                return payload;
            });
        }).catch(function (error) {
            if (error instanceof ImmichError) {
                throw error;
            }

            throw new ImmichError('NETWORK_UNAVAILABLE', 'Unable to reach the Immich server.', error);
        });
    };

    ImmichClient.prototype.url = function (path) {
        if (!this.serverUrl) {
            throw new ImmichError('INVALID_SERVER_URL', 'Enter an Immich server URL.');
        }

        if (shouldUseLocalDevProxy(this.serverUrl)) {
            return global.location.origin + '/__immich-proxy/' + encodeURIComponent(this.serverUrl) + '/api' + path;
        }

        return this.serverUrl + '/api' + path;
    };

    function normalizeServerUrl(value) {
        var serverUrl = String(value || '').trim();
        while (serverUrl.charAt(serverUrl.length - 1) === '/') {
            serverUrl = serverUrl.slice(0, -1);
        }

        if (serverUrl.toLowerCase().slice(-4) === '/api') {
            serverUrl = serverUrl.slice(0, -4);
        }

        return serverUrl;
    }

    function shouldUseLocalDevProxy(serverUrl) {
        if (!global.location || global.location.protocol !== 'http:') {
            return false;
        }

        if (global.location.pathname.indexOf('/__immich-proxy/') === 0) {
            return false;
        }

        return (
            global.location.hostname === 'localhost' ||
            global.location.hostname === '127.0.0.1' ||
            global.location.hostname === '[::1]'
        ) && serverUrl.indexOf(global.location.origin) !== 0;
    }

    function fetchWithTimeout(url, options, timeoutMs) {
        var timeoutId;
        var timeout = new Promise(function (_, reject) {
            timeoutId = global.setTimeout(function () {
                reject(new ImmichError('TIMEOUT', 'Immich server request timed out.'));
            }, timeoutMs);
        });

        return Promise.race([
            global.fetch(url, options),
            timeout
        ]).then(function (response) {
            global.clearTimeout(timeoutId);
            return response;
        }, function (error) {
            global.clearTimeout(timeoutId);
            throw error;
        });
    }

    function parseResponse(response) {
        if (response.status === 204) {
            return Promise.resolve(null);
        }

        var contentType = response.headers.get('content-type') || '';
        if (contentType.indexOf('application/json') >= 0) {
            return response.json();
        }

        return response.text();
    }

    function createHttpError(response, payload) {
        var message = payload && payload.message ? payload.message : 'Immich request failed.';
        var code = 'UNKNOWN';

        if (response.status === 401) {
            code = 'AUTH_INVALID';
            message = 'Invalid email, password, or saved session.';
        } else if (response.status === 403) {
            code = 'PERMISSION_DENIED';
            message = 'The signed-in user does not have permission for this action.';
        } else if (response.status === 404) {
            code = 'NOT_FOUND';
            message = 'Immich endpoint was not found. Check the server URL.';
        } else if (response.status >= 500) {
            code = 'SERVER_ERROR';
            message = 'Immich server returned an error.';
        }

        return new ImmichError(code, message, {
            status: response.status,
            payload: payload
        });
    }

    namespace.ImmichClient = ImmichClient;
    namespace.ImmichError = ImmichError;
    namespace.normalizeServerUrl = normalizeServerUrl;
})(window);
