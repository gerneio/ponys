/* ponys v0.3.7
 * 2024 jhuddle
 *
 * Declarative creation of browser-native web components.
 */


export default class {

	static define(name, template, options, url = '')
	{
		if (customElements.get(name)) return Promise.reject(Error(`Component '${name}' already registered`));
		if (!template.content) {
			let templateElement = document.createElement('template');
			templateElement.innerHTML = template;
			template = templateElement;
		}
		template = template.content;
		url = new URL(url, location.href.startsWith('about:') ? document.baseURI : location.href);

		let script = template.querySelector('script[setup]') || template.querySelector('script');
		if (script && (!script.hasAttribute("setup") || script.type != "module")) console.warn("setup & type=module attributes expected");
		let moduleScript = script?.text?.replace(
			/(import|from)\s*("|')(\.{0,2}\/.*?[^\\])\2/g,  // relative imports
			(match, keyword, quote, path) => keyword + quote + new URL(path, url) + quote
		);
		let blobUrl = URL.createObjectURL(new Blob([moduleScript], { type: 'text/javascript' }));

		return import(`${blobUrl}#tag=${encodeURIComponent(name)}`).then(module => {
			script?.remove();
			class BaseComponent extends (module.default?.prototype instanceof HTMLElement ? module.default : HTMLElement) { }
			for (let prop in module) {
				if (prop === "default" || prop === "constructor") continue;
				if (prop === "disabledFeatures") BaseComponent[prop] = module[prop]; // static class property
				else BaseComponent.prototype[prop] = module[prop];
			}
			class Component extends BaseComponent {
				constructor() {
					super();
					let root = this;
					try { root = root.attachShadow({mode: 'open'}); } catch {}
					this.$ = selector => root.querySelector(selector);
					this.$$ = selector => root.querySelectorAll(selector);
					let content = template.cloneNode(true);
					propagateHost(this, content);
					root.append(content);
					this.init?.();
				}
			}
			customElements.define(name, Component, options);
			return Component;
		}).finally(_ => URL.revokeObjectURL(blobUrl));
	}

	static defineAll(container = document)
	{
		return Promise.allSettled(
			[...container.querySelectorAll('template[name]')].map(template => {
				let options = {};
				for (let {name, value} of template.attributes) {
					options[name] = value;
				}
				return options.src?
					this.import(options.name, options.src, options):
					this.define(options.name, template, options);
			})
		).then(list => {
			list?.filter(e => e.status !== "fulfilled")
				.forEach(e => console.warn("import/define failed", e));
		});
	}

	static import(name, url, options)
	{
		return fetch(url)
			.then(response => response.ok ? response.text() : Promise.reject(Error(url)))
			.then(text => this.define(name, text, options, url));
	}

}


function propagateHost(host, parentElement)
{
	for (let element of parentElement.children) {
		element.host = host;
		element.$ = host.$;
		element.$$ = host.$$;
		propagateHost(host, element);
	}
}
