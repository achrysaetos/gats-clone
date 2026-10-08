"""A small character rig: a Blender armature built from a bone table, rigid mesh parts parented to its bones, and poses
as plain data solved in Python (forward kinematics for the body, two-bone IK for the limbs).

Model space is the sprite bake's: the character faces +X, +Y is its left, +Z is up, and the body's origin is the
collision circle's centre on the floor. A pose names where the hands and feet go in model space, so a hand can stay
on a gun the painter draws at the origin whatever the torso does.
"""

import math

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

from . import common as C


def rot(deg):
    """A rotation from (x, y, z) degrees about the model axes: +y leans forward, +z turns left, +x rolls right side up."""
    return Euler(tuple(math.radians(a) for a in deg), 'XYZ').to_quaternion()


def two_bone(root, target, a, b, pole):
    """Where the middle joint of a two-bone limb goes, and the clamped end, for a chain from root of lengths a and b
    reaching for target and bending toward the pole direction."""
    d = target - root
    dist = min(max(d.length, abs(a - b) + 1e-3), a + b - 1e-3)
    axis = d.normalized()
    end = root + axis * dist
    x = (a * a - b * b + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, a * a - x * x))
    side = pole - axis * pole.dot(axis)
    side = side.normalized() if side.length > 1e-6 else axis.orthogonal().normalized()
    return root + axis * x + side * h, end


class Bone:
    def __init__(self, name, parent, head, tail):
        self.name, self.parent = name, parent
        self.head, self.tail = Vector(head), Vector(tail)


class Limb:
    """Two bones and an end bone: upper (root at its head), lower, and an end that stays rigid with the lower bone."""

    def __init__(self, upper, lower, end):
        self.upper, self.lower, self.end = upper, lower, end


class Rig:
    def __init__(self, bones, limbs):
        self.bones = {b.name: b for b in bones}
        self.limbs = limbs
        self.kits = {}

    def kit(self, bone):
        """The kit whose geometry, given in rest pose and model space, rides on `bone`."""
        return self.kits.setdefault(bone, C.Kit())

    def solve(self, pose):
        """Each bone's (head, rotation from rest) in model space for a pose.

        pose keys: hips (offset), hips_rot, spine, head (rotations, see rot()), and for each limb name a target point
        and a `<name>.pole` direction its middle joint bends toward. Poles and targets are model space.
        """
        out = {}
        hips = self.bones['hips']
        r_hips = rot(pose.get('hips_rot', (0, 0, 0)))
        h0 = hips.head + Vector(pose.get('hips', (0, 0, 0)))
        out['hips'] = (h0, r_hips)

        def child(name, extra=Quaternion()):
            b = self.bones[name]
            ph, pr = out[b.parent]
            pb = self.bones[b.parent]
            head = ph + pr @ (b.head - pb.head)
            out[name] = (head, pr @ extra)

        child('spine', rot(pose.get('spine', (0, 0, 0))))
        child('head', rot(pose.get('head', (0, 0, 0))))
        for name, limb in self.limbs.items():
            up, lo = self.bones[limb.upper], self.bones[limb.lower]
            ph, pr = out[up.parent]
            root = ph + pr @ (up.head - self.bones[up.parent].head)
            a, b = (up.tail - up.head).length, (lo.tail - lo.head).length
            target = Vector(pose[name]) if name in pose else root + pr @ (lo.tail - up.head)
            pole = Vector(pose.get(name + '.pole', pr @ (up.tail - up.head).cross(Vector((0, 1, 0)))))
            mid, end = two_bone(root, target, a, b, pole)
            r_up = (pr @ (up.tail - up.head)).rotation_difference(mid - root) @ pr
            r_lo = (r_up @ (lo.tail - lo.head)).rotation_difference(end - mid) @ r_up
            out[limb.upper] = (root, r_up)
            out[limb.lower] = (mid, r_lo)
            out[limb.end] = (end, r_lo @ rot(pose.get(name + '.twist', (0, 0, 0))))
        return out

    def build(self, root, colls, pose):
        """Builds the armature and its parts under root, then poses it."""
        data = bpy.data.armatures.new('rig')
        arm = C.link(bpy.data.objects.new('rig', data), colls['_model'])
        arm.parent = root
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        for b in self.bones.values():
            eb = data.edit_bones.new(b.name)
            eb.head, eb.tail = b.head, b.tail
        for b in self.bones.values():
            if b.parent:
                data.edit_bones[b.name].parent = data.edit_bones[b.parent]
        bpy.ops.object.mode_set(mode='OBJECT')
        for name, kit in self.kits.items():
            bone = data.bones[name]
            inv = (bone.matrix_local @ Matrix.Translation((0, bone.length, 0))).inverted()
            for objs in kit.build(arm, colls).values():
                for o in objs:
                    o.parent_type = 'BONE'
                    o.parent_bone = name
                    o.matrix_parent_inverse = inv
        solved = self.solve(pose)
        order = []
        while len(order) < len(self.bones):
            for b in self.bones.values():
                if b.name not in order and (b.parent is None or b.parent in order):
                    order.append(b.name)
        for name in order:
            head, r = solved[name]
            rest = data.bones[name].matrix_local.to_quaternion()
            arm.pose.bones[name].matrix = Matrix.Translation(head) @ (r @ rest).to_matrix().to_4x4()
            bpy.context.view_layer.update()
        return arm
