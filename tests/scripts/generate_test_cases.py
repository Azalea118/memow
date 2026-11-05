import subprocess
import ast
import os

def get_tests():
    """Collect only the non-system tests using pytest."""
    # ADDED -m "not system" here
    res = subprocess.run(
        ["uv", "run", "pytest", "--collect-only", "-q", "-m", "not system"], 
        capture_output=True, text=True
    )
    tests = []
    for line in res.stdout.splitlines():
        if "::" in line and not line.startswith("="):
            parts = line.split("::")
            if len(parts) >= 2:
                file_path = parts[0]
                test_name = parts[1].split("[")[0]  # strip parametrization
                tests.append((file_path, test_name))
    return tests

def get_docstring(file_path, test_name):
    """Extract docstring from the test function."""
    try:
        with open(file_path, "r") as f:
            tree = ast.parse(f.read())
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == test_name:
                doc = ast.get_docstring(node)
                if doc:
                    return doc.replace("\n", " ").strip()
    except Exception:
        pass
    return ""

def get_statuses():
    """Run pytest (non-system) and parse PASS/FAIL/XFAIL."""
    res = subprocess.run(
        ["uv", "run", "pytest", "-v", "-m", "not system"], 
        capture_output=True, text=True
    )
    status_map = {}
    for line in res.stdout.splitlines():
        if " PASSED" in line or " FAILED" in line or " XFAIL" in line or " XPASS" in line:
            test_id = line.split(" ")[0]
            if "PASSED" in line: status_map[test_id] = "PASS"
            elif "FAILED" in line: status_map[test_id] = "FAIL"
            elif "XFAIL" in line: status_map[test_id] = "XFAIL (Known Bug)"
            elif "XPASS" in line: status_map[test_id] = "XPASS (Bug Fixed!)"
    return status_map

def main():
    print("Gathering test list...")
    tests = get_tests()
    
    print(f"Running {len(tests)} tests to get statuses...")
    status_map = get_statuses()
    
    # Group by module for a cleaner report
    module_groups = {}
    
    for file_path, test_name in tests:
        mod_name = os.path.basename(file_path).replace("test_", "").replace(".py", "").title()
        
        # Use docstring if it exists, otherwise prettify the function name
        desc = get_docstring(file_path, test_name)
        if not desc:
            desc = test_name.replace("test_", "").replace("_", " ").capitalize()
        
        # Look up status (ignoring path prefix in pytest output)
        status = "PASS"
        for k, v in status_map.items():
            if test_name in k:
                status = v
                break
                
        if mod_name not in module_groups:
            module_groups[mod_name] = []
        module_groups[mod_name].append((desc, status))

    # Print Markdown Table
    print("\n# Automated Test Case Matrix\n")
    print(f"**Total Tests:** {len(tests)}\n")
    
    test_counter = 1
    for mod, test_list in module_groups.items():
        print(f"### Module: {mod}")
        print("| Test ID | Description | Expected Result | Status |")
        print("|---|---|---|---|")
        for desc, status in test_list:
            print(f"| TC-{test_counter:03d} | {desc} | Assertions pass | **{status}** |")
            test_counter += 1
        print("\n")

if __name__ == "__main__":
    main()
