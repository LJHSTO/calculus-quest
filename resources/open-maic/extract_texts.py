import json, sys, os, glob

target_keys = {'text', 'content', 'label', 'title', 'question', 'option', 'explanation', 'analysis', 'description', 'language', 'persona'}
skip_parent_keys = set()

def extract_texts(obj, path='', results=None):
    if results is None:
        results = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            current_path = f'{path}.{k}' if path else k
            if k in target_keys and isinstance(v, str) and len(v) > 0:
                results.append((current_path, v))
            elif isinstance(v, (dict, list)):
                extract_texts(v, current_path, results)
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            current_path = f'{path}[{i}]'
            if isinstance(item, (dict, list)):
                extract_texts(item, current_path, results)
    return results

manifests = [
    r'D:\Projects\Demo\resources\open-maic\A1\manifest.json',
    r'D:\Projects\Demo\resources\open-maic\A2a\manifest.json',
    r'D:\Projects\Demo\resources\open-maic\A2b\manifest.json',
    r'D:\Projects\Demo\resources\open-maic\A3\manifest.json',
    r'D:\Projects\Demo\resources\open-maic\A4\manifest.json',
]

for mf in manifests:
    name = os.path.basename(os.path.dirname(mf))
    print(f'\n{"="*80}')
    print(f'FILE: {name}/manifest.json')
    print(f'{"="*80}')
    try:
        with open(mf, 'r', encoding='utf-8') as f:
            data = json.load(f)
        texts = extract_texts(data)
        for path, text in texts:
            text_one_line = text.replace('\n', '\\n')
            print(f'  [{path}] {text_one_line}')
    except Exception as e:
        print(f'  ERROR: {e}')
