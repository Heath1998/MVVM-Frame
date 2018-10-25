


function createDocumentFragment(template) {
    let frag = document.createRange().createContextualFragment(template);
    var fragment = document.createDocumentFragment()
    fragment.appendChild(frag)
    return fragment;
 }



function initComponent(node, template, component,comProp, vm) {
    var nodeComponent = createDocumentFragment(template)
    for(var i=0, len=nodeComponent.childNodes.length ;i<len ;i++) {
        node.appendChild(nodeComponent.childNodes[0])
    }
    var options = {       
        el: node,
        data: component.data || {},
        methods: component.methods || {},
        computed: component.computed || {}
    }
    if(comProp[0] != []) {
        for(var i=0;i<comProp[0].length;i++) {
            if(component.props && component.props.indexOf(comProp[0][i].name) == -1){
                comProp[0].splice(i,1)
            }
        }
    }
    if(comProp[1].length>0) {
        for(var i=0;i<comProp[0].length;i++) {
            if(component.props && component.props.indexOf(comProp[1][i].name.split(':')[1]) !== -1){
                comProp[1].splice(i,1)
            }
        }
    }
    options['propList'] = comProp 
    var vC = new MVVM(options)


    for(var i=0, len=node.childNodes.length ;i<len ;i++) {
        node.parentNode.insertBefore(node.childNodes[0],node)
    }

    var current = node.parentNode.removeChild(node)

    if(comProp[1] != []) {
        for(var i=0 ;i<comProp[1].length ;++i) {
            bindComWatcher(comProp[1][i].name, comProp[1][i].value, vC, vm)
        }
    }
}


function bindComWatcher(name, exp, vC, vm) {
    var watcher = new Watcher(exp, vm, function (newVal) {
        var c = name
        vC[c] = newVal
    })
}



var reg = /^v\-|^\:|^\@/
var upreg = /^v\-bind\:|^\:/

function initComProps(attrs,component ,vm) {
    var attrsProps = []
    var uProps = []
    attrs.forEach(function(attr) {
        if(!reg.test(attr.name)) {
            attrsProps.push(attr)
        }
    })
 
    for(var i=0, len = attrs.length;i<len;i++) {
        if (upreg.test(attrs[i].name)) {
            var at = {}
            at.name = attrs[i].name.split(':')[1]
           at.value = attrs[i].value
            uProps.push(at)
        }
    }
    var andProps = [attrsProps,uProps]
    return andProps
}