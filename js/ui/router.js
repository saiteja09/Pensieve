(function (global) {
    var namespace = global.Pensieve = global.Pensieve || {};

    function Router(onRouteChange) {
        this.current = null;
        this.history = [];
        this.onRouteChange = onRouteChange;
    }

    Router.prototype.navigate = function (name, params, options) {
        var shouldReplace = options && options.replace;

        if (this.current && !shouldReplace) {
            this.history.push(this.current);
        }

        this.current = {
            name: name,
            params: params || {}
        };

        this.onRouteChange(this.current);
    };

    Router.prototype.back = function () {
        if (!this.history.length) {
            return false;
        }

        this.current = this.history.pop();
        this.onRouteChange(this.current);
        return true;
    };

    Router.prototype.reset = function (name, params) {
        this.history = [];
        this.navigate(name, params, { replace: true });
    };

    namespace.Router = Router;
})(window);
