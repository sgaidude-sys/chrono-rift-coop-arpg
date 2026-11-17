extends Node3D
## Chrono-Rift: Chronicles of Ashenvale — Godot 4.7 Co-Op Arena & Asset Showcase Controller
## Connects to the same Supabase Realtime & REST backend as the WebGL/Three.js client.

@export var supabase_url: String = "https://lanyspyiqpsoyjeymlue.supabase.co"
@export var room_code: String = "ASHEN-1"

var elapsed_time: float = 0.0

func _ready() -> void:
	print("[Chrono-Rift Godot 4.7] Loaded Ashenvale Co-Op Arena — Room: ", room_code)

func _process(delta: float) -> void:
	elapsed_time += delta
	var portal := get_node_or_null("AstralRiftPortal")
	if portal and portal is Node3D:
		portal.rotation.y = sin(elapsed_time * 0.5) * 0.15
	var shrine := get_node_or_null("SanctuaryReviveShrine")
	if shrine and shrine is Node3D:
		shrine.position.y = sin(elapsed_time * 2.0) * 0.08
