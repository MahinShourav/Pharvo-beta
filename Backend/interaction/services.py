"""Drug-interaction detection services.

The interaction data lives in the ``inventory_druginteraction`` table (the
``inventory.DrugInteraction`` model). These helpers match the products in a POS
cart against that table and describe the detected interactions in a format that
is easy for the frontend to display.

Levels that represent a clinical warning are: ``caution``, ``avoid``,
``high_risk`` and ``contraindicated``. ``beneficial`` combinations (for example
Amoxicillin + Clavulanic acid) are informative but are deliberately excluded
from POS warnings so normal prescriptions are not interrupted.
"""

from inventory.models import DrugInteraction

# Levels that should be surfaced as a warning at the POS.
WARNING_LEVELS = frozenset(
    {"caution", "avoid", "high_risk", "contraindicated"}
)

# Human-readable recommendation for each warning level.
LEVEL_RECOMMENDATIONS = {
    "caution": "Use with caution. Monitor the patient closely and only "
    "dispense if the benefit outweighs the risk.",
    "avoid": "Avoid this combination. Look for a safer alternative.",
    "high_risk": "High-risk combination. Re-check with the prescriber before "
    "dispensing.",
    "contraindicated": "Contraindicated. Do not dispense these together.",
    "beneficial": "Beneficial combination commonly used together.",
}

LEVEL_ORDER = {
    "beneficial": 0,
    "caution": 1,
    "avoid": 2,
    "high_risk": 3,
    "contraindicated": 4,
}


def interaction_match_terms(drug):
    """Return the lowercase matching terms for one side of an interaction.

    A drug entry may hold a class name with alternatives separated by "/"
    (for example "SSRI/Sertraline" or "ACE inhibitor/Enalapril"). Each
    alternative is treated as its own matchable term.
    """
    terms = {drug.strip().lower()}
    for token in drug.split("/"):
        token = token.strip().lower()
        if token:
            terms.add(token)
    return {term for term in terms if term}


def product_interaction_identifiers(product):
    """Return the lowercase identifiers used to match a product to a drug.

    A product can be matched through its name, its medicine group and its
    category, e.g. a product named "Warfarin 5mg Tablet" grouped under
    "Anticoagulants".
    """
    identifiers = {product.name}
    if product.group_id:
        identifiers.add(product.group.name)
    if product.category_id:
        identifiers.add(product.category.name)
    return {
        identifier.strip().lower()
        for identifier in identifiers
        if identifier and identifier.strip()
    }


def _term_matches_identifiers(term, identifiers):
    for identifier in identifiers:
        if term == identifier or (len(term) >= 4 and term in identifier):
            return True
    return False


def _matching_product_ids(terms, products_by_id):
    return {
        product_id
        for product_id, identifiers in products_by_id.items()
        if any(_term_matches_identifiers(term, identifiers) for term in terms)
    }


def _level_recommendation(level):
    return LEVEL_RECOMMENDATIONS.get(level, "Exercise caution when dispensing.")


def _serialize(interaction, product_a, product_b):
    return {
        "interaction_id": interaction.pk,
        "level": interaction.interaction_level,
        "level_display": interaction.get_interaction_level_display(),
        "recommendation": _level_recommendation(interaction.interaction_level),
        "description": interaction.description,
        "drug_a": interaction.drug_a,
        "drug_b": interaction.drug_b,
        "products": [
            {"id": product_a.id, "name": product_a.name},
            {"id": product_b.id, "name": product_b.name},
        ],
    }


def detect_cart_interactions(products, include_beneficial=False):
    """Detect known drug interactions between the given products.

    ``products`` is an iterable of ``inventory.Product`` instances (prefer
    ``select_related("group", "category")``). Only pairs made of two different
    products are considered, and each (interaction, product A, product B) triple
    is reported once. The result is sorted by severity, strongest first.
    """
    products = list(products)
    products_by_id = {product.id: product_interaction_identifiers(product) for product in products}
    if len(products_by_id) < 2:
        return []

    candidates = DrugInteraction.objects.filter(is_active=True)
    found = []
    seen = set()
    for interaction in candidates:
        if not include_beneficial and interaction.interaction_level == "beneficial":
            continue
        a_terms = interaction_match_terms(interaction.drug_a)
        b_terms = interaction_match_terms(interaction.drug_b)
        a_ids = _matching_product_ids(a_terms, products_by_id)
        b_ids = _matching_product_ids(b_terms, products_by_id)
        for product_a_id in a_ids:
            for product_b_id in b_ids:
                if product_a_id == product_b_id:
                    continue
                key = (interaction.pk, product_a_id, product_b_id)
                if key in seen:
                    continue
                seen.add(key)
                product_a = next(p for p in products if p.id == product_a_id)
                product_b = next(p for p in products if p.id == product_b_id)
                found.append(_serialize(interaction, product_a, product_b))

    found.sort(key=lambda item: LEVEL_ORDER.get(item["level"], 0), reverse=True)
    return found