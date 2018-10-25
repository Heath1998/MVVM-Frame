
function MVVM(options) {
	if(options.propList) {
		for(var i=0 ;i < options.propList[0].length ;i++) {
			this[options.propList[0][i].name] = options.propList[0][i].value
		}
		for(var i=0 ;i < options.propList[1].length ;i++) {
			this[options.propList[1][i].name] = options.propList[1][i].value
		}
	}
	if(typeof options.data === 'function') {
		options.data = options.data()
		if(options.propList && options.propList[1] != undefined) {
			for(var i=0 ;i < options.propList[1].length ;i++) {
				options.data[options.propList[1][i].name] = options.propList[1][i].value
			}
		}
	}
	this.$data = options.data || {}
	this.$el = typeof options.el === 'string'
		? document.querySelector(options.el)
        : options.el || document.body
    options = Object.assign({},
        {
            computed: {},
            methods : {}
        },
		options);

    this.$options = options
	this.window = window;	  // 为了exp中全局对象（Math、location等）的计算取值
	if(options.data) {
		this._proxy(options)
	}
	// 代理属性，直接用vm.props访问data、method、computed内数据/方法
	var ob = new Observer(this.$data);
	this._proxyMethods(options.methods);   // method不劫持getter/setter
	if (!ob) return;
	new Compiler({el: this.$el, vm: this});
}

MVVM.prototype = {
 
	_proxy       : function (data) {
		var self = this;
		var proxy = ['data', 'computed'];
		proxy.forEach(function (item) {
			Object.keys(data[item]).forEach(function (key) {
				Object.defineProperty(self, key, {
					configurable: false,
					enumerable  : true,
					get         : function () {
						// 注意不要返回与或表达式，会因类型转换导致出错
						// return self.$data[key] || ((typeof self.$options.computed[key] !== 'undefined') && self.$options.computed[key].call(self));
						if (typeof self.$data[key] !== 'undefined') {
							return self.$data[key];
						} else if (typeof self.$options.computed[key] !== 'undefined') {
							return self.$options.computed[key].call(self);
						} else {
							return undefined;
						}
					},
					set         : function (newVal) {
						if (self.$data.hasOwnProperty(key)) {
							self.$data[key] = newVal;
						} else if (self.$options.computed.hasOwnProperty(key)) {
							self.$options.computed[key] = newVal;
						}
					}
				});
			})
		})
	},

	// method不劫持getter/setter，直接引用
	_proxyMethods: function (methods) {
		var self = this;
		Object.keys(methods).forEach(function (key) {
			self[key] = self.$options.methods[key];
		})
	}
}