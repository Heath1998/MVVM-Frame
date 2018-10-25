
var $$id = 0

function Compiler(options) {
	// create node
    this.$el = options.el

    // save viewModel
    this.vm = options.vm

    // to documentFragment
    if (this.$el) {
        this.$fragment = nodeToFragment(this.$el)
        this.compile(this.$fragment)
        this.$el.appendChild(this.$fragment)
    }    
}

Compiler.prototype = {
    // 编译主体，遍历子元素
    compile: function(node, scope)  {
        var self = this
        node.$id = $$id++
        if(node.childNodes && node.childNodes.length) {
            [].slice.call(node.childNodes).forEach(function(child) {
                if (child.nodeType === 3) {
					self.compileTextNode(child, scope);
                } else if (child.nodeType === 1) {
                    self.compileElementNode(child, scope);
                }
            })
        }
    } ,

    // 编译文本元素，解析表达式
    compileTextNode: function(node, scope) {
        var text = node.textContent.trim()
        if (!text) {
            return ;
        } 
        var exp = parseTextExp(text)
        scope = scope || this.vm
        this.textHandler(node, scope, exp)
    },

    // 编译节点元素，调用相应的指令处理方法或者调用compile继续编译
    compileElementNode: function (node, scope) {
        var attrs = [].slice.call(node.attributes)   // attributes是动态的，要复制到数组里面去遍历
        var lazyCompileDir = '';
		var lazyCompileExp = '';
        var self = this;
        scope = scope || this.vm;

        //component
        if(scope.$options.components) {
            var str = ''
            var res ;
            Object.keys(scope.$options.components).forEach(function (templateName) {

                if(templateName == node.tagName.toLowerCase()) {
                str = templateName
                res = (eval('/\\<(.*?)' + str + '(.*?)\\>(.*?)'+ '\\<\\/(.*?)' + str + '(.*?)\\>/' ))
                if(res.test(node.outerHTML)) {
                    if(attrs) {
                       var comProp = initComProps(attrs,scope.$options.components[templateName], scope)
                    }
                    initComponent(node, scope.$options.components[templateName].template , scope.$options.components[templateName],comProp, scope)
                    return ;
                }
            }
            })
        }
        attrs.forEach(function (attr) {
            var attrName = attr.name
            var exp = attr.value
            var dir = checkDirective(attrName)
            if (dir.type) {
                if (dir.type === 'for' || dir.type === 'if') {
                    lazyCompileDir = dir.type;
					lazyCompileExp = exp;
                } else {
                    var handler = self[dir.type + 'Handler'].bind(self)  // 不要漏掉bind(this)，否则其内部this指向会出错
                    if (handler) {
                        handler(node, scope, exp, dir.prop)
                    } else {
                        console.error('找不到' + dir.type + '指令');
                    }
                }
                node.removeAttribute(attrName)
            }
        }) 
        // if/for懒编译（编译完其他指令后才编译）
		if (lazyCompileExp) {
			this[lazyCompileDir + 'Handler'](node, scope, lazyCompileExp);
		} else {
			this.compile(node, scope);
		}
    },

	/**
	 * 指令处理，指令主要有：
	 * v-text： 表达式编译 @done
	 * v-model：数据视图双向绑定 @done
	 * v-on：事件绑定 @done
	 * v-bind：控制属性
	 * v-show：控制可视化属性，可归在v-bind内
	 * v-if、v-for、v-else（暂不做）：控制流，根据当前值会对子元素造成影响：
	 * v-html： html编译，要做一定的xss拦截
	 * v-pre、v-cloak、v-once：控制不编译、保持内容不变，单次编译暂时不做：
	 * */

    // 绑定事件，三种形式：v-on:click="handler"， v-on:click="add($index)"， v-on:click="count=count+1"
    onHandler: function (node, scope, exp, eventType) {
        if (!eventType) {
            return console.log()
        }
        // 函数名
        var fn = scope[exp];
        if(typeof fn === 'function') {
            node.addEventListener(eventType, fn.bind(scope))  // bind生成一个绑定this的新函数，而call和apply只是调用
        } else {
                // 表达式和add(item)，使用computeExpression(exp, scope)
			node.addEventListener(eventType, function () {
				computeExpression(exp, scope);
			});
        }
    },
    
    // html指令 v-html="expression"
    htmlHandler: function (node, scope, exp, prop) {
        var updateFn = updater.html
        var self = this
        var watcher = new Watcher(exp, scope, function (newVal) {
            updateFn && updateFn(node, newVal, prop) 
            self.compile(node,scope)
        }) 
    },

    // if指令 v-if="expression"
	ifHandler: function (node, scope, exp, prop) {
		// 先编译子元素，然后根据表达式决定是否插入dom中
		// PS：这里需要先插入一个占位元素来定位，不能依赖其他元素，万一其他元素没了呢？
		this.compile(node, scope);
        var refNode = document.createTextNode('');
		node.parentNode.insertBefore(refNode, node);
		var current = node.parentNode.removeChild(node);
		this.bindWatcher(current, scope, exp, 'dom', refNode); // refNode是引用关系，移动到parentNode后会自动更新位置，所以可以传入
    },
    
    // text指令 v-text="expression"
    textHandler: function (node, scope, exp, prop) {
        this.bindWatcher(node, scope, exp, 'text')
    },

	/**
	 * model双向绑定，v-model="expression"
	 * 不同的元素绑定的值不同：checkbox、radio绑定的是checked，其他为value
	 * 不同的元素也有不同的处理方式：checkbox处理value数组，其他处理value的单值
	 * */
    modelHandler: function (node, scope, exp, prop) {
        if (node.tagName.toLowerCase() === 'input') {
            switch (node.type) {
                default: 
                    this.bindWatcher(node, scope, exp, 'value')
                    node.addEventListener('input', function (e) {
                        node.isInputting = true // 由于上面绑定了自动更新，循环依赖了，中文输入法不能用。这里加入一个标志避开自动update
                        var newValue = e.target.value
                        var calExp = exp + '=`' + newValue + '`'
                        with (scope) {
							eval(calExp);
						} 
                    })
            }
        }
    },

    // 列表指令 v-for="item in items"
    forHandler: function (node, scope, exp, prop) {
        var self = this
        var itemName = exp.split('in')[0].replace(/\s/g, '')
        var arrNames = exp.split('in')[1].replace(/\s/g, '').split('.')
        var parentNode = node.parentNode
        var startNode = document.createTextNode('')
        var endNode = document.createTextNode('')
        var range = document.createRange()
        parentNode.replaceChild(endNode, node)  //去掉原始的模板
        parentNode.insertBefore(startNode, endNode)
        //开始监听
        var watcher = new Watcher(arrNames.join('.'), scope, function (newArray, oldArray, options) {
            range.setStart(startNode, 0);
			range.setEnd(endNode, 0);
            range.deleteContents();
            newArray.forEach(function (item, index) {
                var cloneNode = node.cloneNode(true)
                parentNode.insertBefore(cloneNode, endNode)   //新建的dom节点插入

                var forScope = Object.create(scope)  //创建的新对象不包括原型链的属性和方法
                forScope[itemName] = item  // 绑定item作用域
                forScope.$index = index   // 增加$index下标
                self.compile(cloneNode, forScope)
            })

        })


    },

	// 属性指令 v-bind:id="id", v-bind:class="cls"
    bindHandler: function (node, scope, exp, attr) {
        switch(attr) {
            case 'class': 
                // 拼成 "baseCls "+(a?"acls ":"")+(b?"bcls ":"")的形式
                exp = '"' + node.className + ' "+' + parseClassExp(exp)
                break
            case 'style':
                var styleStr = node.getAttribute('style')
                exp = '"' + styleStr + ';"+' + parseStyleExp(exp)
                break
            default:
        }
        this.bindWatcher(node, scope, exp, 'attr', attr)
        
    },

    // 绑定监听者
    bindWatcher: function (node, scope, exp, dir, prop) {
        //添加一个Watcher，监听exp相关的所有字段变化
        var updateFn = updater[dir]
        var watcher = new Watcher(exp, scope, function (newVal) {
            updateFn && updateFn(node, newVal, prop)
        })
    }
     
}

/**
 * 解析class表达式，eg：
 * <div class="static" v-bind:class="{ active: isActive, 'text-danger': hasError }"></div>
 * <div v-bind:class="[isActive ? activeClass : '', errorClass]">
 */
function parseClassExp(exp) {
    if (!exp) {
		return;
    }
    var regObj = /\{(.+?)\}/g
    var regArr = /\[(.+?)\]/
    var result = []
    if (regObj.test(exp)) {
        var subExp = exp.replace(/[\s\{\}]/g, '').split(',')
        subExp.forEach(function (sub) {
            var key = '"' + sub.split(':')[0].replace(/['"']/, '') + ' "'
            var value = sub.split(':')[1]
            result.push('((' + value + ')?' + key + ':"")')
        })
    } else if (regArr.test(exp)) {
        var subExp = exp.replace(/[\s\[\]]/g, '').split(',')
        result = subExp.map(function (sub) {
            return '(' + sub +')' + '+" "'
        })
    }
    return result.join('+');  // 拼成 (a?"acls ":"")+(b?"bcls ":"")的形式
}

/**
 * 解析style表达式 @todo 目前未写单个对象语法和数组语法，eg：
 * <div v-bind:style="{ color: activeColor, font-size: fontSize }"></div>
 * <div v-bind:style="[baseStyles, overridingStyles]">
 */
function parseStyleExp(exp) {
    if (!exp) {
		return;
    }
    var regObj = /\{(.+?)\}/g
    var regArr = /\[(.+?)\]/g
    var result = []
    if (regObj.test(exp)) { 
        var subExp = exp.replace(/[\s\{\}]/g, '').split(',') 
        subExp.forEach(function (sub) {
            var key = '"' + sub.split(':')[0].replace(/['"`]/g, '') + ':"+'
            var value = sub.split(':')[1]
            result.push(key + value + '+";"')
        })
    } else if(regArr.test(exp)) {
        var subExp = exp.replace(/[\s\[\]]/g, '').split(',')
        result = subExp.map(function (sub) {
            return '(' + sub + ')' + '+";"'
        })
    }
    return result.join('+')
}

// 复制节点到文档碎片
function nodeToFragment(node) {
    var fragment = document.createDocumentFragment(),child
    var n = 0
    while(child = node.firstChild) {
        n++
        if (isIgnorable(child)) {
            node.removeChild(child)
        } else {
            fragment.appendChild(child)
        }
    }
    return fragment
}

// 忽略注释节点和换行节点
function isIgnorable(node) {
	// ignore comment node || a text node
    var regIgnorable = /[^\t\n\r]+/;
    //匹配到存在不是\t\n\r的字符就返回false
	return (node.nodeType == 8) || ((node.nodeType == 3) && (!regIgnorable.test(node.textContent)));
}

// 检查属性，返回指令类型
function checkDirective(attrName) {
    var dir = {}
	if (attrName.indexOf('v-') === 0) {
		var parse = attrName.substring(2).split(':');
		dir.type = parse[0];
		dir.prop = parse[1];
	} else if (attrName.indexOf('@') === 0) {
		dir.type = 'on';
		dir.prop = attrName.substring(1);
	} else if (attrName.indexOf(':') === 0) {
		dir.type = 'bind';
		dir.prop = attrName.substring(1);
	}
	return dir;
}

// 解析文本表达式，未包含pipe语法，但是pipe语法其实可以用computed函数实现
function parseTextExp(text) {
	var regText = /\{\{(.+?)\}\}/g;
	var pieces = text.split(regText);
	var matches = text.match(regText);
	// 文本节点转化为常量和变量的组合表达式，PS：表达式中的空格不管，其他空格要保留
	// 'a {{b+"text"}} c {{d+Math.PI}}' => '"a " + b + "text" + " c" + d + Math.PI'
	var tokens = [];
	pieces.forEach(function (piece) {
		if (matches && matches.indexOf('{{' + piece + '}}') > -1) {    // 注意排除无{{}}的情况
			tokens.push(piece);
		} else if (piece) {
			tokens.push('`' + piece + '`');
		}
	});
	return tokens.join('+');
}

var updater = {
    html: function (node, newVal) {
        node.innerHTML = typeof newVal === 'undefined' ? '' : newVal
    },

    text: function (node, newVal) {
        node.textContent = typeof newVal === 'undefined' ? '' : newVal
    },

    value: function (node, newVal) {
		// 当有输入的时候循环依赖了，中文输入法不能用。这里加入一个标志避开自动update
		if (!node.isInputting) {
			node.value = newVal ? newVal : '';
		}
		node.isInputting = false;  // 记得要重置标志        
    },

    //if命令
    dom     : function (node, newVal, nextNode) {
		if (newVal) {
			nextNode.parentNode.insertBefore(node, nextNode);
		} else {
            if (node.parentNode === nextNode.parentNode) {
                nextNode.parentNode.removeChild(node);
                }
		}
    },
    attr    : function(node, newVal, attrName) {
        newVal = typeof newVal === 'undefined' ? '' : newVal
        node.setAttribute(attrName, newVal)
    },
    style   : function (node, newVal, attrName) {
		newVal = typeof newVal === 'undefined' ? '' : newVal;
		if (attrName === 'display') {
			newVal = newVal ? 'initial' : 'none';
        }
		node.style[attrName] = newVal;
	},
}