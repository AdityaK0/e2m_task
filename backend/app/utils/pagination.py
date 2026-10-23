import math


def total_pages(total: int, page_size: int) -> int:
    if total <= 0:
        return 0
    return math.ceil(total / page_size)


def pagination_meta(total: int, page: int, page_size: int) -> dict:
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": total_pages(total, page_size),
    }
