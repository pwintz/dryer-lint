import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as dryer from '../extension';
import Rule, {RuleConfig} from '../rule';


suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Test Calling Dryer', () => {
		var ruleConfig: RuleConfig = {
			name: 'name', 
			pattern: 'pattern', 
			message: 'message', 
			caseInsensitive: false
		};
		var rule = Rule.ruleConfigToRule(ruleConfig);
		
		// var rule = new Rule('id', 1, 'message', 'name');
	});
});
