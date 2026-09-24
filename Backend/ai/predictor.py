"""PHARVO AI decision-support predictor.

Adapted from the ``database-(sumon)`` branch
(``PHARVO-Day1-Part1-Medicine/backend/ai_service/predictor.py``).

Loads the pre-trained TF-IDF + LinearSVC pipeline
(``ai/model/PHARVO_svm_FINAL.pkl``) together with the 36-class
problem mapping CSV. The classifier output is a health-problem
category for decision support only — never a diagnosis and never
an automatic prescription. Callers must require pharmacist review
(``requires_pharmacist_review=True``).
"""

import csv
import re
from pathlib import Path

import joblib
from django.conf import settings


def _model_dir():
    return Path(settings.BASE_DIR) / "ai" / "model"


def _model_path():
    return _model_dir() / "PHARVO_svm_FINAL.pkl"


def _mapping_path():
    return _model_dir() / "PHARVO_36class_mapping_FINAL.csv"


_model = None
_problem_mapping = None


def _get_model():
    global _model
    if _model is None:
        _model = joblib.load(_model_path())
    return _model


def _get_mapping():
    global _problem_mapping
    if _problem_mapping is None:
        mapping = {}
        with open(_mapping_path(), "r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                generics = [
                    item.strip()
                    for item in row["candidate_generics"].split(";")
                    if item.strip()
                ]
                mapping[row["problem_id"]] = {
                    "health_problem": row["health_problem"],
                    "candidate_generics": generics,
                }
        _problem_mapping = mapping
    return _problem_mapping


def normalize_query(text: str) -> str:
    """Normalize common Bangla/Banglish pharmacy expressions pre-classification."""
    original = str(text).strip()
    normalized = original.casefold()

    gastric_patterns = [
        r"গ্যাসের সমস্যা",
        r"গ্যাস সমস্যা",
        r"অ্যাসিডিটি",
        r"এসিডিটি",
        r"\bgas er somossa\b",
        r"\bgas er problem\b",
        r"\bgastric problem\b",
    ]
    for pattern in gastric_patterns:
        if re.search(pattern, normalized):
            return original + " gastric acidity problem"
    return original


def predict_health_problem(text: str) -> dict:
    """Classify a customer complaint into a health-problem category."""
    if not text or not str(text).strip():
        raise ValueError("Query text cannot be empty.")

    normalized_text = normalize_query(text)
    problem_id = _get_model().predict([normalized_text])[0]
    info = _get_mapping().get(problem_id, {})

    return {
        "input_text": text,
        "normalized_query": normalized_text,
        "problem_id": problem_id,
        "health_problem": info.get("health_problem"),
        "candidate_generics": info.get("candidate_generics", []),
        "confidence": None,
        "requires_pharmacist_review": True,
    }
