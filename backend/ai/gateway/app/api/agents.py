from fastapi import APIRouter, Request

router = APIRouter()


@router.post("/negotiate")
async def negotiate(req: dict, request: Request):
    orch = request.app.state.orchestrator
    return await orch.run_agent("Negotiation", req)


@router.post("/dispatch")
async def dispatch(req: dict, request: Request):
    orch = request.app.state.orchestrator
    return await orch.run_agent("Dispatch", req)


@router.post("/pricing")
async def pricing(req: dict, request: Request):
    orch = request.app.state.orchestrator
    return await orch.run_agent("Pricing", req)


@router.post("/fraud")
async def fraud(req: dict, request: Request):
    orch = request.app.state.orchestrator
    return await orch.run_agent("Fraud", req)


@router.post("/compliance")
async def compliance(req: dict, request: Request):
    orch = request.app.state.orchestrator
    return await orch.run_agent("Compliance", req)


@router.post("/contract")
async def contract(req: dict, request: Request):
    orch = request.app.state.orchestrator
    return await orch.run_agent("Contract", req)


@router.post("/payment")
async def payment(req: dict, request: Request):
    orch = request.app.state.orchestrator
    return await orch.run_agent("Payment", req)


@router.post("/route")
async def route(req: dict, request: Request):
    orch = request.app.state.orchestrator
    return await orch.run_agent("Route", req)


@router.post("/copilot")
async def copilot(req: dict, request: Request):
    orch = request.app.state.orchestrator
    return await orch.run_agent("Copilot", req)


@router.post("/fleet")
async def fleet(req: dict, request: Request):
    orch = request.app.state.orchestrator
    return await orch.run_agent("Fleet", req)
