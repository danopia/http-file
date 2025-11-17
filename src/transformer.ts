export function transformScript(text: string) {

  // The http file community has a 'wait' workaround for the lack of a delay function
  // We try to replace several versions of that with a proper async sleep
  text = text.replace(/const wait = seconds => \{[^}]+\};\n/, '');
  text = text.replace(/import {wait} from "[^"]+"\n/, '');
  text = text.replace(/^( +)(wait\()/m, (_,a,b) => `${a}await ${b}`);

  // Another way of delaying execution:
  text = text.replace(/^( +)execSync\('sleep ([0-9]+)'\)/m, (_,a,b) => `${a}await wait(${b})`);

  return text;
}
