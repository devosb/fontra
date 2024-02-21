import pathlib
from dataclasses import dataclass, field, replace
from typing import Any

from fontTools.misc.transform import Transform

from ..core.classes import GlobalAxis, GlobalDiscreteAxis, VariableGlyph
from ..core.protocols import ReadableFontBackend

_actions = {}


def registerActionClass(name, argumentsType):
    def wrapper(cls):
        assert name not in _actions
        cls.actionName = name
        _actions[name] = cls, argumentsType
        return cls

    return wrapper


def getAction(name, input, **arguments):
    if name not in _actions:
        raise KeyError(f"No action found named '{name}'")
    cls, argumentsType = _actions[name]
    action = cls(input=input, arguments=argumentsType(**arguments))
    assert isinstance(action, ReadableFontBackend)
    return action


@dataclass(kw_only=True)
class BaseAction:
    input: ReadableFontBackend
    arguments: dict

    def close(self) -> None:
        ...

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        glyph = await self.input.getGlyph(glyphName)
        return await self.processGlyph(glyph)

    async def getGlobalAxes(self) -> list[GlobalAxis | GlobalDiscreteAxis]:
        axes = await self.input.getGlobalAxes()
        return await self.processGlobalAxes(axes)

    async def getGlyphMap(self) -> dict[str, list[int]]:
        glyphMap = await self.input.getGlyphMap()
        return await self.processGlyphMap(glyphMap)

    async def getCustomData(self) -> dict[str, Any]:
        customData = await self.input.getCustomData()
        return await self.processCustomData(customData)

    async def getUnitsPerEm(self) -> int:
        unitsPerEm = await self.input.getUnitsPerEm()
        return await self.processUnitsPerEm(unitsPerEm)

    # Default no-op process methods, to be overridden.

    # These methods should *not* modify the objects, but return modified *copies*

    async def processGlyph(self, glyph):
        return glyph

    async def processGlobalAxes(self, axes):
        return axes

    async def processGlyphMap(self, glyphMap):
        return glyphMap

    async def processCustomData(self, customData):
        return customData

    async def processUnitsPerEm(self, unitsPerEm):
        return unitsPerEm


@dataclass(kw_only=True)
class ScaleActionArguments:
    scaleFactor: float
    scaleUnitsPerEm: bool = True


@registerActionClass("scale", ScaleActionArguments)
@dataclass(kw_only=True)
class ScaleAction(BaseAction):
    async def processGlyph(self, glyph):
        transformation = Transform().scale(self.arguments.scaleFactor)
        return replace(
            glyph,
            layers={
                layerName: replace(
                    layer, glyph=self._scaleGlyph(layer.glyph, transformation)
                )
                for layerName, layer in glyph.layers.items()
            },
        )

    def _scaleGlyph(self, glyph, transformation):
        return replace(
            glyph,
            path=glyph.path.transformed(transformation),
            components=[
                self._scaleComponentOrigin(component) for component in glyph.components
            ],
        )

    def _scaleComponentOrigin(self, component):
        scaleFactor = self.arguments.scaleFactor
        x = component.transformation.translateX * scaleFactor
        y = component.transformation.translateY * scaleFactor
        return replace(
            component,
            transformation=replace(
                component.transformation, translateX=x, translateY=y
            ),
        )

    async def processUnitsPerEm(self, unitsPerEm):
        if self.arguments.scaleUnitsPerEm:
            return unitsPerEm * self.arguments.scaleFactor
        else:
            return unitsPerEm


@dataclass(kw_only=True)
class SubsetActionArguments:
    glyphNames: set[str] = field(default_factory=set)
    glyphNamesFile: str | None = None

    def __post_init__(self):
        if self.glyphNamesFile:
            path = pathlib.Path(self.glyphNamesFile)
            assert path.is_file()
            glyphNames = set(path.read_text().split())
            self.glyphNames = self.glyphNames | glyphNames


@registerActionClass("subset", SubsetActionArguments)
@dataclass(kw_only=True)
class SubsetAction(BaseAction):
    def __post_init__(self):
        self._glyphMap = None

    async def _getSubsettedGlyphMap(self):
        if self._glyphMap is None:
            bigGlyphMap = await self.input.getGlyphMap()
            subsettedGlyphMap = {}
            glyphNames = set(self.arguments.glyphNames)
            while glyphNames:
                glyphName = glyphNames.pop()
                if glyphName not in bigGlyphMap:
                    continue

                subsettedGlyphMap[glyphName] = bigGlyphMap[glyphName]

                # TODO: add getGlyphsMadeOf() ReadableFontBackend protocol member,
                # so backends can implement this more efficiently
                glyph = await self.input.getGlyph(glyphName)
                compoNames = {
                    compo.name
                    for layer in glyph.layers.values()
                    for compo in layer.glyph.components
                }
                for compoName in compoNames:
                    if compoName in bigGlyphMap and compoName not in subsettedGlyphMap:
                        glyphNames.add(compoName)

            self._glyphMap = subsettedGlyphMap
        return self._glyphMap

    async def getGlyph(self, glyphName):
        glyphMap = await self._getSubsettedGlyphMap()
        if glyphName not in glyphMap:
            return None
        return await self.input.getGlyph(glyphName)

    async def getGlyphMap(self):
        return await self._getSubsettedGlyphMap()
