// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Provide a minimal `matchMedia` mock for JSDOM used by Jest
if (typeof window !== 'undefined' && !window.matchMedia) {
	window.matchMedia = function (query) {
		return {
			matches: false,
			media: query,
			onchange: null,
			addListener: function () {},
			removeListener: function () {},
			addEventListener: function () {},
			removeEventListener: function () {},
			dispatchEvent: function () { return false; }
		};
	};
}
