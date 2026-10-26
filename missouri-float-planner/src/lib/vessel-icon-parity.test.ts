import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Read JSX without loading React Native. Vercel installs only the web tree;
// the web and native renderers intentionally keep separate SVG wrappers.
function silhouette(file: string) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const shapes: { vessel: string | null; tag: string; attributes: Record<string, string> }[] = [];
  function visit(node: ts.Node, vessel: string | null) {
    if (ts.isJsxExpression(node) && node.expression) {
      const expression = node.expression;
      const condition = ts.isConditionalExpression(expression) ? expression.condition
        : ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? expression.left : null;
      const match = condition?.getText(source).match(/^vessel\s*===\s*['"]([^'"]+)['"]$/);
      if (match) vessel = match[1];
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source).toLowerCase();
      if (['svg', 'g', 'path', 'ellipse', 'rect', 'circle'].includes(tag)) {
        const attributes: Record<string, string> = {};
        for (const attribute of node.attributes.properties) {
          assert.ok(ts.isJsxAttribute(attribute), `${file}: SVG attributes must be explicit`);
          const name = attribute.name.getText(source);
          if (['aria-hidden', 'accessible', 'importantForAccessibility'].includes(name)) continue;
          const initializer = attribute.initializer;
          const value = !initializer ? 'true' : ts.isStringLiteral(initializer) ? initializer.text
            : ts.isJsxExpression(initializer) ? initializer.expression?.getText(source) ?? '' : initializer.getText(source);
          attributes[name] = ['color', 'currentColor'].includes(value) ? '$color' : value;
        }
        shapes.push({ vessel, tag, attributes });
      }
    }
    ts.forEachChild(node, child => visit(child, vessel));
  }
  visit(source, null);
  assert.ok(shapes.length > 10, `${file}: expected the complete SVG geometry`);
  assert.deepEqual([...new Set(shapes.map(shape => shape.vessel).filter(Boolean))].sort(), ['canoe', 'kayak', 'raft', 'tube']);
  return shapes;
}

test('web and iOS Vessel icons keep the same silhouettes, proportions, and strokes', () => {
  assert.deepEqual(
    silhouette('src/components/ui/VesselIcon.tsx'),
    silhouette('../eddy-ios/src/components/VesselIcon.tsx'),
  );
});
