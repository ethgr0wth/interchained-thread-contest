#!/usr/bin/env python3
"""
Script to create judges and super admins for the Interchained Thread Contest.

Usage:
    python scripts/create_admin.py --username <username> --password <password> [--super-admin]

Examples:
    # Create a regular judge
    python scripts/create_admin.py --username judge1 --password mypassword123

    # Create a super admin
    python scripts/create_admin.py --username superadmin2 --password supersecret --super-admin

    # List all judges
    python scripts/create_admin.py --list

    # Delete a judge
    python scripts/create_admin.py --delete --username judge1
"""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import db

def create_judge(username: str, password: str, is_super_admin: bool = False):
    existing = db.get_judge(username)
    if existing:
        print(f"Error: Judge '{username}' already exists!")
        return False
    
    judge = db.create_judge(username, password, is_super_admin)
    role = "Super Admin" if is_super_admin else "Judge"
    print(f"Successfully created {role}: {username}")
    print(f"  ID: {judge.id}")
    print(f"  Created: {judge.created_at}")
    return True

def list_judges():
    judges = db.get_all_judges()
    if not judges:
        print("No judges found.")
        return
    
    print(f"\n{'Username':<20} {'Role':<15} {'Created':<25}")
    print("-" * 60)
    for judge in judges:
        role = "Super Admin" if judge.is_super_admin else "Judge"
        created = judge.created_at[:19] if judge.created_at else "N/A"
        print(f"{judge.username:<20} {role:<15} {created:<25}")
    print(f"\nTotal: {len(judges)} judges")

def delete_judge(username: str):
    if username in ["admin", "superadmin"]:
        confirm = input(f"Are you sure you want to delete the default '{username}'? (yes/no): ")
        if confirm.lower() != "yes":
            print("Cancelled.")
            return False
    
    if db.delete_judge(username):
        print(f"Successfully deleted judge: {username}")
        return True
    else:
        print(f"Judge '{username}' not found.")
        return False

def main():
    parser = argparse.ArgumentParser(description="Manage judges and super admins")
    parser.add_argument("--username", "-u", help="Username for the judge")
    parser.add_argument("--password", "-p", help="Password for the judge")
    parser.add_argument("--super-admin", "-s", action="store_true", help="Create as super admin")
    parser.add_argument("--list", "-l", action="store_true", help="List all judges")
    parser.add_argument("--delete", "-d", action="store_true", help="Delete a judge")
    
    args = parser.parse_args()
    
    if args.list:
        list_judges()
    elif args.delete:
        if not args.username:
            print("Error: --username is required for deletion")
            sys.exit(1)
        delete_judge(args.username)
    elif args.username and args.password:
        create_judge(args.username, args.password, args.super_admin)
    else:
        parser.print_help()
        print("\n--- Current Judges ---")
        list_judges()

if __name__ == "__main__":
    main()
